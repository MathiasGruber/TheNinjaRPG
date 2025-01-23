import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, and, or, gte, like, isNull, inArray } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { clan, mpvpBattleQueue, mpvpBattleUser, actionLog } from "@/drizzle/schema";
import { userData, userRequest, historicalAvatar } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { fetchVillage } from "@/routers/village";
import { fetchUser, updateNindo } from "@/routers/profile";
import { getServerPusher } from "@/libs/pusher";
import { clanCreateSchema, checkCoLeader } from "@/validators/clan";
import { hasRequiredRank } from "@/libs/train";
import {
  fetchRequest,
  fetchRequests,
  insertRequest,
  updateRequestState,
} from "@/routers/sparring";
import { initiateBattle } from "@/routers/combat";
import { CLAN_LOBBY_SECONDS, CLAN_RANK_REQUIREMENT } from "@/drizzle/constants";
import { CLAN_CREATE_RYO_COST, CLANS_PER_STRUCTURE_LEVEL } from "@/drizzle/constants";
import { CLAN_CREATE_PRESTIGE_REQUIREMENT } from "@/drizzle/constants";
import { CLAN_MAX_MEMBERS } from "@/drizzle/constants";
import { MAX_TRAINING_BOOST, TRAINING_BOOST_COST } from "@/drizzle/constants";
import { MAX_RYO_BOOST, RYO_BOOST_COST } from "@/drizzle/constants";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import type { inferRouterOutputs } from "@trpc/server";
import type { DrizzleClient } from "@/server/db";
import type { UserData } from "@/drizzle/schema";
import { secondsFromDate } from "@/utils/time";

const pusher = getServerPusher();

export const clanRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [user, fetchedClan] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Guard
      if (user.villageId === fetchedClan?.villageId) return fetchedClan;
      return null;
    }),
  getAll: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClans] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClans(ctx.drizzle, input.villageId),
      ]);
      // Guard
      if (user && user.villageId === input.villageId) return fetchedClans;
      return null;
    }),
  getAllNames: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.clan.findMany({
      columns: { id: true, name: true, image: true },
    });
  }),
  getRequests: protectedProcedure.query(async ({ ctx }) => {
    return await fetchRequests(ctx.drizzle, ["CLAN"], 3600 * 12, ctx.userId);
  }),
  searchClans: protectedProcedure
    .input(z.object({ name: z.string().trim() }))
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.clan.findMany({
        columns: {
          id: true,
          name: true,
          image: true,
        },
        where: like(clan.name, `%${input.name}%`),
        orderBy: [sql`LENGTH(${clan.name}) asc`],
        limit: 5,
      });
    }),
  createRequest: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Guards
      if (!fetchedClan) return errorResponse("Clan not found");
      if (!user) return errorResponse("User not found");
      if (!fetchedClan.leaderId) return errorResponse("No leader currently");
      if (user.villageId !== fetchedClan.villageId)
        return errorResponse("Wrong village");
      if (user.clanId) return errorResponse("Already in a clan");
      if (!hasRequiredRank(user.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse(`Rank must be at least ${CLAN_RANK_REQUIREMENT}`);
      }
      // Mutate
      await insertRequest(ctx.drizzle, user.userId, fetchedClan.leaderId, "CLAN");
      void pusher.trigger(fetchedClan.leaderId, "event", { type: "clan" });
      // Create
      return { success: true, message: "User assigned to clan" };
    }),
  rejectRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "CLAN");
      if (request.receiverId !== ctx.userId) {
        return errorResponse("You can only reject requests for yourself");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only reject pending requests");
      }
      void pusher.trigger(request.senderId, "event", { type: "clan" });
      return await updateRequestState(ctx.drizzle, input.id, "REJECTED", "CLAN");
    }),
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "CLAN");
      if (request.senderId !== ctx.userId) {
        return errorResponse("You can only cancel requests created by you");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only cancel pending requests");
      }
      void pusher.trigger(request.receiverId, "event", { type: "clan" });
      return await updateRequestState(ctx.drizzle, input.id, "CANCELLED", "CLAN");
    }),
  acceptRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const request = await fetchRequest(ctx.drizzle, input.id, "CLAN");
      // Secondary fetches
      const [fetchedClan, requester, leader] = await Promise.all([
        fetchClanByLeader(ctx.drizzle, request.receiverId),
        fetchUser(ctx.drizzle, request.senderId),
        fetchUser(ctx.drizzle, request.receiverId),
      ]);
      // Derived
      const nMembers = fetchedClan?.members.length || 0;
      // Guards
      if (!fetchedClan) return errorResponse("Clan not found");
      if (!requester) return errorResponse("Requester not found");
      if (!leader) return errorResponse("Leader not found");
      if (nMembers >= CLAN_MAX_MEMBERS) return errorResponse("Clan is full");
      if (ctx.userId !== request.receiverId) return errorResponse("Not your request");
      if (ctx.userId !== fetchedClan.leaderId) return errorResponse("Not clan leader");
      if (requester.clanId) return errorResponse("Requester already in a clan");
      if (requester.villageId !== leader.villageId) return errorResponse("!= village");
      if (!hasRequiredRank(leader.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse(`Rank must be at least ${CLAN_RANK_REQUIREMENT}`);
      }
      // Mutate
      await Promise.all([
        updateRequestState(ctx.drizzle, input.id, "ACCEPTED", "CLAN"),
        ctx.drizzle
          .update(userData)
          .set({ clanId: fetchedClan.id })
          .where(eq(userData.userId, requester.userId)),
      ]);
      void pusher.trigger(request.senderId, "event", { type: "clan" });
      // Create
      return { success: true, message: "Request accepted" };
    }),
  createClan: protectedProcedure
    .input(clanCreateSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, village, clans] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        fetchClans(ctx.drizzle, input.villageId),
      ]);
      // Derived
      const villageId = village?.id;
      const structure = village?.structures.find((s) => s.route === "/clanhall");
      // Guards
      if (!user) return errorResponse("User not found");
      if (!village) return errorResponse("Village not found");
      if (!structure) return errorResponse("Clan hall not found");
      if (villageId !== user.villageId) return errorResponse("Wrong user village");
      if (clans.find((c) => c.name === input.name)) return errorResponse("Name taken");
      if (clans.find((c) => c.leaderId === ctx.userId))
        if (user.clanId) return errorResponse("Already in a clan");
      if (user.isAi) return errorResponse("AI cannot be leader");
      if (user.money < CLAN_CREATE_RYO_COST) return errorResponse("Not enough ryo");
      if (clans.length > structure.level * CLANS_PER_STRUCTURE_LEVEL) {
        return errorResponse("Max clans reached");
      }
      if (user.villagePrestige < CLAN_CREATE_PRESTIGE_REQUIREMENT) {
        return errorResponse("Not enough prestige");
      }
      if (!hasRequiredRank(user.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse("Rank too low");
      }
      // Reduce money
      const clanId = nanoid();
      const result = await ctx.drizzle
        .update(userData)
        .set({
          clanId: clanId,
          money: sql`${userData.money} - ${CLAN_CREATE_RYO_COST}`,
        })
        .where(eq(userData.userId, user.userId));
      if (result.rowsAffected === 0) return errorResponse("Failed to reduce money");
      // Mutate
      await ctx.drizzle.insert(clan).values({
        id: clanId,
        image: IMG_AVATAR_DEFAULT,
        villageId: village.id,
        name: input.name,
        founderId: user.userId,
        leaderId: user.userId,
        leaderOrderId: nanoid(),
      });
      // Create
      return { success: true, message: "Clan created" };
    }),
  editClan: protectedProcedure
    .input(z.object({ clanId: z.string(), name: z.string(), image: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan, image] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
        ctx.drizzle.query.historicalAvatar.findFirst({
          where: eq(historicalAvatar.avatar, input.image),
        }),
      ]);
      // Guards
      if (!fetchedClan) return errorResponse("Clan not found");
      if (!user) return errorResponse("User not found");
      if (!image) return errorResponse("Image not found");
      if (!image.avatar) return errorResponse("Image not found");
      if (fetchedClan.leaderId !== user.userId) return errorResponse("Not clan leader");
      if (fetchedClan.villageId !== user.villageId) return errorResponse("!= village");
      if (user.clanId !== fetchedClan.id) return errorResponse("Wrong Clan");
      // Mutate
      await ctx.drizzle
        .update(clan)
        .set({ name: input.name, image: image.avatar })
        .where(eq(clan.id, fetchedClan.id));
      // Create
      return { success: true, message: "Clan updated" };
    }),
  promoteMember: protectedProcedure
    .input(z.object({ clanId: z.string(), memberId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan, member] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
        fetchUser(ctx.drizzle, input.memberId),
      ]);
      if (!fetchedClan) return errorResponse("Clan not found");
      // Derived
      const isLeader = user.userId === fetchedClan?.leaderId;
      const isColeader = checkCoLeader(user.userId, fetchedClan);
      const isMemberColeader = checkCoLeader(input.memberId, fetchedClan);
      const updateData = (() => {
        if (isMemberColeader && isLeader)
          return {
            leaderId: input.memberId,
            coLeader1:
              fetchedClan.coLeader1 === input.memberId ? null : fetchedClan.coLeader1,
            coLeader2:
              fetchedClan.coLeader2 === input.memberId ? null : fetchedClan.coLeader2,
            coLeader3:
              fetchedClan.coLeader3 === input.memberId ? null : fetchedClan.coLeader3,
            coLeader4:
              fetchedClan.coLeader4 === input.memberId ? null : fetchedClan.coLeader4,
          };
        if (!fetchedClan?.coLeader1) return { coLeader1: input.memberId };
        if (!fetchedClan?.coLeader2) return { coLeader2: input.memberId };
        if (!fetchedClan?.coLeader3) return { coLeader3: input.memberId };
        if (!fetchedClan?.coLeader4) return { coLeader4: input.memberId };
        return null;
      })();
      // Guards
      if (!user) return errorResponse("User not found");
      if (!member) return errorResponse("Member not found");
      if (!isLeader && !isColeader) return errorResponse("Only leaders can promote");
      if (isMemberColeader && !isLeader) return errorResponse("Only for leader");
      if (member.userId === user.userId) return errorResponse("Not yourself");
      if (member.clanId !== fetchedClan.id) return errorResponse("Not in clan");
      if (!updateData) return errorResponse("No more co-leaders can be added");
      if (!hasRequiredRank(member.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse("Leader rank too low");
      }
      // Mutate
      await ctx.drizzle.update(clan).set(updateData).where(eq(clan.id, fetchedClan.id));
      // Create
      return { success: true, message: "Member promoted" };
    }),
  demoteMember: protectedProcedure
    .input(z.object({ clanId: z.string(), memberId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, clanData, member] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
        fetchUser(ctx.drizzle, input.memberId),
      ]);
      // Derived
      const isLeader = user.userId === clanData?.leaderId;
      const isColeader = checkCoLeader(user.userId, clanData);
      const isMemberLeader = input.memberId === clanData?.leaderId;
      const isMemberColeader = checkCoLeader(input.memberId, clanData);
      const isYourself = ctx.userId === input.memberId;
      // Guards
      if (!clanData) return errorResponse("Clan not found");
      if (!user) return errorResponse("User not found");
      if (!member) return errorResponse("Member not found");
      if (!isLeader && !isColeader) return errorResponse("Only leaders can demote");
      if (isMemberLeader) return errorResponse("New leader must be promoted first");
      if (member.clanId !== clanData.id) return errorResponse("Not in clan");
      if (!hasRequiredRank(member.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse("Leader rank too low");
      }
      if (isMemberColeader && !isLeader && !isYourself) {
        return errorResponse("Only for leader");
      }
      // Mutate
      await ctx.drizzle
        .update(clan)
        .set({
          coLeader1: clanData.coLeader1 === member.userId ? null : clanData.coLeader1,
          coLeader2: clanData.coLeader2 === member.userId ? null : clanData.coLeader2,
          coLeader3: clanData.coLeader3 === member.userId ? null : clanData.coLeader3,
          coLeader4: clanData.coLeader4 === member.userId ? null : clanData.coLeader4,
        })
        .where(eq(clan.id, clanData.id));
      // Create
      return { success: true, message: "Member demoted" };
    }),
  kickMember: protectedProcedure
    .input(z.object({ clanId: z.string(), memberId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan, member] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
        fetchUser(ctx.drizzle, input.memberId),
      ]);
      // Derived
      const isLeader = user.userId === fetchedClan?.leaderId;
      const isColeader = checkCoLeader(user.userId, fetchedClan);
      const isMemberColeader = checkCoLeader(input.memberId, fetchedClan);
      const isMemberLeader = input.memberId === fetchedClan?.leaderId;
      // Guards
      if (!fetchedClan) return errorResponse("Clan not found");
      if (!user) return errorResponse("User not found");
      if (!member) return errorResponse("Member not found");
      if (isMemberLeader) return errorResponse("Cannot kick leader");
      if (fetchedClan.villageId !== user.villageId) return errorResponse("!= village");
      if (!isLeader && !isColeader) return errorResponse("Not allowed");
      if (!isLeader && isMemberColeader) return errorResponse("Only leader can kick");
      // Mutate
      await removeFromClan(ctx.drizzle, fetchedClan, member, [
        `Kicked by ${user.username}`,
      ]);
      // Create
      return { success: true, message: "Member kicked" };
    }),
  leaveClan: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Guards
      if (!user) return errorResponse("User not found");
      if (!fetchedClan) return errorResponse("Clan not found");
      if (!user.clanId) return errorResponse("Not in a clan");
      if (user.status !== "AWAKE") return errorResponse("Must be awake to leave");
      if (user.clanId !== fetchedClan.id) return errorResponse("Wrong clan");
      if (user.villageId !== fetchedClan.villageId) {
        return errorResponse("Wrong village");
      }
      // Derived
      await removeFromClan(ctx.drizzle, fetchedClan, user, ["Left clan on own accord"]);
      // Create
      return { success: true, message: "User left clan" };
    }),
  upsertNotice: protectedProcedure
    .input(z.object({ content: z.string(), clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, fetchedClan] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Derived
      const isLeader = fetchedClan?.leaderId === user.userId;
      const isCoLeader = checkCoLeader(ctx.userId, fetchedClan);
      const leaderLike = isLeader || isCoLeader;
      // Guards
      if (!user) return errorResponse("User not found");
      if (!fetchedClan) return errorResponse("Clan not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (user.isSilenced) return errorResponse("User is silenced");
      if (!leaderLike) return errorResponse("Not in clan leadership");
      // Update
      return updateNindo(
        ctx.drizzle,
        fetchedClan.leaderOrderId,
        input.content,
        "clanOrder",
      );
    }),
  fightLeader: protectedProcedure
    .input(z.object({ clanId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, clanData, village] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);
      // Guards
      if (!village) return errorResponse("Village not found");
      if (!user.clanId) return errorResponse("Must be within the clan to challenge");
      if (!clanData) return errorResponse("Clan not found");
      if (user.villageId !== village.id) return errorResponse("Wrong village");
      if (clanData.id !== user.clanId) return errorResponse("Wrong clan");
      if (!hasRequiredRank(user.rank, CLAN_RANK_REQUIREMENT)) {
        return errorResponse("Rank too low");
      }
      // Start the battle
      return await initiateBattle(
        {
          userIds: [ctx.userId],
          targetIds: [clanData.leaderId],
          client: ctx.drizzle,
          asset: "arena",
        },
        "CLAN_CHALLENGE",
      );
    }),
  toBank: protectedProcedure
    .input(z.object({ amount: z.number().min(0), clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [user, fetchedClan] = await Promise.all([
        await fetchUser(ctx.drizzle, ctx.userId),
        await fetchClan(ctx.drizzle, input.clanId),
      ]);
      if (user.money < input.amount) return errorResponse("Not enough money in pocket");
      if (user.isBanned) return errorResponse("You are banned");
      if (!user.clanId) return errorResponse("Not in a clan");
      if (fetchedClan?.id !== user.clanId) return errorResponse("Not in the clan");
      const result = await ctx.drizzle
        .update(userData)
        .set({ money: sql`${userData.money} - ${input.amount}` })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, input.amount)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in pocket" };
      }
      await ctx.drizzle
        .update(clan)
        .set({ bank: sql`${clan.bank} + ${input.amount}` })
        .where(eq(clan.id, input.clanId));
      return { success: true, message: `Successfully deposited ${input.amount} ryo` };
    }),
  purchaseTrainingBoost: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, clanData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Derived
      const isLeader = clanData?.leaderId === user.userId;
      const isCoLeader = checkCoLeader(ctx.userId, clanData);
      const leaderLike = isLeader || isCoLeader;
      // Guard
      if (!user) return errorResponse("User not found");
      if (!clanData) return errorResponse("Clan not found");
      if (user.clanId !== clanData.id) return errorResponse("Not in the clan");
      if (!leaderLike) return errorResponse("Not in clan leadership");
      if (clanData.points < TRAINING_BOOST_COST) {
        return errorResponse("Not enough clan points");
      }
      if (clanData.trainingBoost >= MAX_TRAINING_BOOST) {
        return errorResponse("Max training boost reached");
      }
      // Mutate
      const result = await ctx.drizzle
        .update(clan)
        .set({
          trainingBoost: sql`${clan.trainingBoost} + 1`,
          points: sql`${clan.points} - ${TRAINING_BOOST_COST}`,
        })
        .where(and(eq(clan.id, clanData.id), gte(clan.points, TRAINING_BOOST_COST)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough clan points" };
      }
      return { success: true, message: "Training boost purchased" };
    }),
  purchaseRyoBoost: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, clanData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.clanId),
      ]);
      // Derived
      const isLeader = clanData?.leaderId === user.userId;
      const isCoLeader = checkCoLeader(ctx.userId, clanData);
      const leaderLike = isLeader || isCoLeader;
      // Guard
      if (!user) return errorResponse("User not found");
      if (!clanData) return errorResponse("Clan not found");
      if (user.clanId !== clanData.id) return errorResponse("Not in the clan");
      if (!leaderLike) return errorResponse("Not in clan leadership");
      if (clanData.points < RYO_BOOST_COST) {
        return errorResponse("Not enough clan points");
      }
      if (clanData.ryoBoost >= MAX_RYO_BOOST) {
        return errorResponse("Max ryo boost reached");
      }
      // Mutate
      const result = await ctx.drizzle
        .update(clan)
        .set({
          ryoBoost: sql`${clan.ryoBoost} + 1`,
          points: sql`${clan.points} - ${RYO_BOOST_COST}`,
        })
        .where(and(eq(clan.id, clanData.id), gte(clan.points, RYO_BOOST_COST)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough clan points" };
      }
      return { success: true, message: "Ryo boost purchased" };
    }),
  getClanBattles: protectedProcedure
    .input(z.object({ clanId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchClanBattles(ctx.drizzle, input.clanId);
    }),
  challengeClan: protectedProcedure
    .input(z.object({ challengerClanId: z.string(), targetClanId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, challenger, defender, queries] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClan(ctx.drizzle, input.challengerClanId),
        fetchClan(ctx.drizzle, input.targetClanId),
        fetchActiveUserClanBattles(ctx.drizzle, ctx.userId),
      ]);
      // Derived
      const isLeader = challenger?.leaderId === user.userId;
      const isCoLeader = checkCoLeader(ctx.userId, challenger);
      const leaderLike = isLeader || isCoLeader;
      // Guards
      if (!user) return errorResponse("User not found");
      if (user.status !== "AWAKE") return errorResponse("Must be awake to challenge");
      if (!challenger) return errorResponse("Challenger not found");
      if (!defender) return errorResponse("Defender not found");
      if (challenger.id === defender.id) return errorResponse("Cannot challenge self");
      if (!leaderLike) return errorResponse("Not in clan leadership");
      if (queries.length > 0) return errorResponse("Already in queue");
      if (user.clanId !== challenger.id) return errorResponse("Not in challenger clan");
      // Mutation 1: update user early & ensure status
      const clanBattleId = nanoid();
      const result = await ctx.drizzle
        .update(userData)
        .set({ status: "QUEUED" })
        .where(and(eq(userData.userId, user.userId), eq(userData.status, "AWAKE")));
      if (result.rowsAffected === 0) return errorResponse("Was not awake?");
      // Mutation 2: insert new entries
      await Promise.all([
        ctx.drizzle.insert(mpvpBattleQueue).values({
          id: clanBattleId,
          clan1Id: challenger.id,
          clan2Id: defender.id,
          createdAt: new Date(),
        }),
        ctx.drizzle.insert(mpvpBattleUser).values({
          id: nanoid(),
          userId: user.userId,
          clanBattleId: clanBattleId,
        }),
      ]);
      // Notify all clan members of both clans
      [
        ...challenger.members.map((m) => m.userId),
        ...defender.members.map((m) => m.userId),
      ].forEach((userId) => {
        void pusher.trigger(userId, "event", {
          type: "userMessage",
          message: `${challenger.name} clan has challenged ${defender.name} to a clan battle.`,
          route: "/clanhall",
          routeText: "To Clan Hall",
        });
      });
      return { success: true, message: "Clan challenge initiated" };
    }),
  joinClanBattle: protectedProcedure
    .input(z.object({ clanBattleId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, clanBattleData, queries] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClanBattle(ctx.drizzle, input.clanBattleId),
        fetchActiveUserClanBattles(ctx.drizzle, ctx.userId),
      ]);
      // Guards
      if (!user) return errorResponse("User not found");
      if (!clanBattleData) return errorResponse("Clan battle not found");
      if (clanBattleData.battleId) return errorResponse("Clan battle already started");
      if (!user.clanId) return errorResponse("Not in a clan");
      if (user.status !== "AWAKE") return errorResponse("Must be awake to join");
      if (queries.length > 0) return errorResponse("Already in queue");
      if (
        clanBattleData.clan1Id !== user.clanId &&
        clanBattleData.clan2Id !== user.clanId
      ) {
        return errorResponse("Not in the clan battle");
      }
      // Mutation 1: update user early & ensure status
      const result = await ctx.drizzle
        .update(userData)
        .set({ status: "QUEUED" })
        .where(and(eq(userData.userId, user.userId), eq(userData.status, "AWAKE")));
      if (result.rowsAffected === 0) return errorResponse("Was not awake?");
      // Mutation 2
      await ctx.drizzle.insert(mpvpBattleUser).values({
        id: nanoid(),
        userId: user.userId,
        clanBattleId: input.clanBattleId,
      });
      return { success: true, message: "Joined clan battle" };
    }),
  leaveClanBattle: protectedProcedure
    .input(z.object({ clanBattleId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, clanBattleData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClanBattle(ctx.drizzle, input.clanBattleId),
      ]);
      // Derived
      const queued = clanBattleData?.queue.some((q) => q.userId === user.userId);
      const battleId = input.clanBattleId;
      // Guards
      if (!user) return errorResponse("User not found");
      if (!clanBattleData) return errorResponse("Clan battle not found");
      if (user.status !== "QUEUED") return errorResponse(`Not queued in ${battleId}`);
      if (!queued) return errorResponse("Not in the queue");
      // Mutation
      await removeFromClanBattle(
        ctx.drizzle,
        clanBattleData.queue,
        input.clanBattleId,
        ctx.userId,
      );
      return { success: true, message: "Left clan battle" };
    }),
  kickFromClanBattle: protectedProcedure
    .input(
      z.object({ clanBattleId: z.string(), targetId: z.string(), clanId: z.string() }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, target, fetchedClan, clanBattleData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.targetId),
        fetchClan(ctx.drizzle, input.clanId),
        fetchClanBattle(ctx.drizzle, input.clanBattleId),
      ]);
      // Derived
      const queued = clanBattleData?.queue.some((q) => q.userId === target.userId);
      const battleId = input.clanBattleId;
      // Derived
      const isLeader = user.userId === fetchedClan?.leaderId;
      const isColeader = checkCoLeader(user.userId, fetchedClan);
      const isMemberColeader = checkCoLeader(input.targetId, fetchedClan);
      // Guards
      if (!clanBattleData) return errorResponse("Clan battle not found");
      if (target.status !== "QUEUED") return errorResponse(`Not queued in ${battleId}`);
      if (!queued) return errorResponse("Not in the queue");
      if (!isLeader && !isColeader) return errorResponse("Not allowed");
      if (!isLeader && isMemberColeader) return errorResponse("Only leader can kick");
      // Mutation
      void pusher.trigger(target.userId, "event", {
        type: "userMessage",
        message: `${user.username} kicked you out of a clan battle.`,
        route: "/clanhall",
        routeText: "To Clan Hall",
      });
      await removeFromClanBattle(
        ctx.drizzle,
        clanBattleData.queue,
        input.clanBattleId,
        target.userId,
      );
      return { success: true, message: "Kicked from clan battle" };
    }),
  initiateClanBattle: protectedProcedure
    .input(z.object({ clanBattleId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, clanBattleData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchClanBattle(ctx.drizzle, input.clanBattleId),
      ]);
      // Derived
      clanBattleData?.queue.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
      const allIds = clanBattleData?.queue.map((q) => q.userId);
      const challengers = clanBattleData?.queue.filter(
        (q) => q.user.clanId === clanBattleData.clan1Id,
      );
      const defenders = clanBattleData?.queue.filter(
        (q) => q.user.clanId === clanBattleData.clan2Id,
      );
      if (!challengers || !defenders) return errorResponse("No users");
      // Limit challengers & defenders to maximum allowed
      const maxOnEachSide = Math.min(challengers.length ?? 0, defenders.length ?? 0);
      const challengerIds = challengers.slice(0, maxOnEachSide).map((u) => u.userId);
      const defenderIds = defenders.slice(0, maxOnEachSide).map((u) => u.userId);
      // Guards
      if (!user) return errorResponse("User not found");
      if (!clanBattleData) return errorResponse("Clan battle not found");
      if (clanBattleData.battleId) return errorResponse("Battle already initiated");
      if (!allIds) return errorResponse("No users");
      if (maxOnEachSide === 0) return errorResponse("Not enough users");
      if (
        clanBattleData.clan1Id !== user.clanId &&
        clanBattleData.clan2Id !== user.clanId
      ) {
        return errorResponse("Not in the clan battle");
      }
      if (new Date() < secondsFromDate(CLAN_LOBBY_SECONDS, clanBattleData.createdAt)) {
        return errorResponse("Clan battle not started yet");
      }
      // Start the battle
      const result = await initiateBattle(
        {
          userIds: challengerIds,
          targetIds: defenderIds,
          client: ctx.drizzle,
          asset: "arena",
        },
        "CLAN_BATTLE",
      );

      if (result.success && result.battleId) {
        await Promise.all([
          ctx.drizzle
            .update(mpvpBattleQueue)
            .set({ battleId: result.battleId })
            .where(eq(mpvpBattleQueue.id, input.clanBattleId)),
          ...(allIds.length > 0
            ? [
                ctx.drizzle
                  .update(userData)
                  .set({
                    status: sql`CASE WHEN status = "QUEUED" THEN "AWAKE" ELSE status END`,
                  })
                  .where(inArray(userData.userId, allIds)),
              ]
            : []),
        ]);
        return { success: true, message: "Clan battle initiated" };
      }
      return errorResponse("Failed to initiate clan battle");
    }),
});

/**
 * Removes a user from an clan.
 *
 * @param client - The DrizzleClient instance used for database operations.
 * @param clanData - The clan from which the user will be removed.
 * @param userId - The ID of the user to be removed from the clan.
 */
export const removeFromClan = async (
  client: DrizzleClient,
  clanData: NonNullable<ClanRouter["get"]>,
  user: UserData,
  reasons: string[],
) => {
  // Derived
  const userId = user.userId;
  const isLeader = clanData?.leaderId === userId;
  // Find another user, prefer coleaders in case it's leader being removed
  const otherUser = clanData?.members
    .filter((m) => hasRequiredRank(m.rank, CLAN_RANK_REQUIREMENT))
    .sort((a, b) => {
      if (checkCoLeader(a.userId, clanData)) return -1;
      if (checkCoLeader(b.userId, clanData)) return 1;
      return 0;
    })
    .find((m) => m.userId !== userId);
  const coLeadersToRemove = isLeader ? [userId, otherUser?.userId ?? null] : [userId];
  // Mutate
  await Promise.all([
    client
      .update(userData)
      .set({
        clanId: null,
        status: sql`CASE WHEN status = "QUEUED" THEN "AWAKE" ELSE status END`,
      })
      .where(eq(userData.userId, userId)),
    client
      .delete(userRequest)
      .where(
        and(
          eq(userRequest.type, "CLAN"),
          or(eq(userRequest.senderId, userId), eq(userRequest.receiverId, userId)),
        ),
      ),
    client.delete(mpvpBattleUser).where(eq(mpvpBattleUser.userId, userId)),
    client.insert(actionLog).values({
      id: nanoid(),
      userId: userId,
      tableName: "clan",
      changes: reasons,
      relatedId: clanData.id,
      relatedMsg: `${user.username} removed from clan: ${clanData.name}`,
      relatedImage: clanData.image,
    }),
    ...(!otherUser
      ? [
          client.delete(clan).where(eq(clan.id, clanData.id)),
          client.delete(mpvpBattleQueue).where(eq(mpvpBattleQueue.id, clanData.id)),
          client
            .update(userData)
            .set({
              clanId: null,
              status: sql`CASE WHEN status = "QUEUED" THEN "AWAKE" ELSE status END`,
            })
            .where(eq(userData.clanId, clanData.id)),
        ]
      : [
          client
            .update(clan)
            .set({
              leaderId: isLeader && otherUser ? otherUser.userId : clanData.leaderId,
              coLeader1: coLeadersToRemove.includes(clanData.coLeader1)
                ? null
                : clanData.coLeader1,
              coLeader2: coLeadersToRemove.includes(clanData.coLeader2)
                ? null
                : clanData.coLeader2,
              coLeader3: coLeadersToRemove.includes(clanData.coLeader3)
                ? null
                : clanData.coLeader3,
              coLeader4: coLeadersToRemove.includes(clanData.coLeader4)
                ? null
                : clanData.coLeader4,
            })
            .where(eq(clan.id, clanData.id)),
        ]),
  ]);
};

/**
 * Removes a user from a clan battle.
 *
 * @param client - The DrizzleClient instance used to interact with the database.
 * @param currentQueue - The current queue of users in the clan battle.
 * @param clanBattleId - The ID of the clan battle.
 * @param userId - The ID of the user to remove from the clan battle.
 * @returns A Promise that resolves when the user has been removed from the clan battle.
 */
export const removeFromClanBattle = async (
  client: DrizzleClient,
  currentQueue: { userId: string }[],
  clanBattleId: string,
  userId: string,
) => {
  await Promise.all([
    ...(currentQueue.length === 1
      ? [client.delete(mpvpBattleQueue).where(eq(mpvpBattleQueue.id, clanBattleId))]
      : []),
    client
      .delete(mpvpBattleUser)
      .where(
        and(
          eq(mpvpBattleUser.clanBattleId, clanBattleId),
          eq(mpvpBattleUser.userId, userId),
        ),
      ),
    client.update(userData).set({ status: "AWAKE" }).where(eq(userData.userId, userId)),
  ]);
};

/**
 * Fetches a clan battle by its ID.
 * @param client - The Drizzle client.
 * @param clanBattleId - The ID of the clan battle to fetch.
 * @returns - A promise that resolves to the fetched clan battle, or null if not found.
 */
export const fetchClanBattle = async (client: DrizzleClient, clanBattleId: string) => {
  return await client.query.mpvpBattleQueue.findFirst({
    where: eq(mpvpBattleQueue.id, clanBattleId),
    with: {
      queue: {
        columns: { userId: true, createdAt: true },
        with: { user: { columns: { clanId: true, avatar: true, username: true } } },
      },
    },
  });
};

/**
 * Fetches clan battles for a given clan ID.
 * @param client - The DrizzleClient instance used for querying.
 * @param clanId - The ID of the clan to fetch battles for.
 * @returns A promise that resolves to an array of clan battles.
 */
export const fetchClanBattles = async (client: DrizzleClient, clanId: string) => {
  return await client.query.mpvpBattleQueue.findMany({
    where: or(eq(mpvpBattleQueue.clan1Id, clanId), eq(mpvpBattleQueue.clan2Id, clanId)),
    with: {
      queue: {
        columns: { userId: true },
        with: {
          user: {
            columns: {
              clanId: true,
              avatar: true,
              username: true,
              level: true,
              rank: true,
            },
          },
        },
      },
      clan1: { columns: { id: true, name: true, image: true } },
      clan2: { columns: { id: true, name: true, image: true } },
    },
    orderBy: (mpvpBattleQueue, { desc }) => [desc(mpvpBattleQueue.createdAt)],
  });
};

/**
 * Fetches the clan battle queue for a specific user.
 * @param client - The Drizzle client instance.
 * @param userId - The ID of the user.
 * @returns - A promise that resolves to an array of clan battle queue items.
 */
export const fetchActiveUserClanBattles = async (
  client: DrizzleClient,
  userId: string,
) => {
  return await client
    .select(getTableColumns(mpvpBattleUser))
    .from(mpvpBattleUser)
    .innerJoin(
      mpvpBattleQueue,
      and(
        eq(mpvpBattleUser.clanBattleId, mpvpBattleQueue.id),
        isNull(mpvpBattleQueue.winnerId),
      ),
    )
    .where(eq(mpvpBattleUser.userId, userId));
  return await client.query.mpvpBattleUser.findMany({
    where: eq(mpvpBattleUser.userId, userId),
  });
};

/**
 * Fetches clans based on the provided village ID.
 * @param client - The DrizzleClient instance used for querying.
 * @param villageId - The ID of the village to fetch clans for.
 * @returns A promise that resolves to an array of clans.
 */
export const fetchClans = async (client: DrizzleClient, villageId: string) => {
  return await client.query.clan.findMany({
    with: {
      leader: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
      founder: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
      members: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
    },
    where: eq(clan.villageId, villageId),
  });
};

/**
 * Fetches a clan from the database based on the clan ID.
 *
 * @param  client - The Drizzle client used to query the database.
 * @param  clanId - The ID of the clan to fetch.
 * @returns - A promise that resolves to the fetched clan, or null if not found.
 */
export const fetchClan = async (client: DrizzleClient, clanId: string) => {
  return await client.query.clan.findFirst({
    with: {
      leader: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
      founder: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
      village: {
        columns: {
          name: true,
        },
      },
      members: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
          pvpActivity: true,
        },
      },
      leaderOrder: true,
    },
    where: eq(clan.id, clanId),
  });
};

/**
 * Fetches the clan details by leader ID.
 * @param client - The Drizzle client instance.
 * @param leaderId - The ID of the clan leader.
 * @returns - A promise that resolves to the clan details.
 */
export const fetchClanByLeader = async (client: DrizzleClient, leaderId: string) => {
  return await client.query.clan.findFirst({
    with: {
      members: {
        columns: {
          userId: true,
          username: true,
          level: true,
          rank: true,
          avatar: true,
        },
      },
    },
    where: eq(clan.leaderId, leaderId),
  });
};

export type ClanRouter = inferRouterOutputs<typeof clanRouter>;
