import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { anbuSquad, userData, historicalAvatar } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { fetchVillage } from "@/routers/village";
import { fetchUser, fetchUpdatedUser, updateNindo } from "@/routers/profile";
import { getServerPusher } from "@/libs/pusher";
import { anbuCreateSchema } from "@/validators/anbu";
import { hasRequiredRank } from "@/libs/train";
import { secondsFromDate } from "@/utils/time";
import {
  fetchRequest,
  fetchRequests,
  insertRequest,
  updateRequestState,
} from "@/routers/sparring";
import { ANBU_MEMBER_RANK_REQUIREMENT } from "@/drizzle/constants";
import { ANBU_LEADER_RANK_REQUIREMENT } from "@/drizzle/constants";
import { ANBU_MAX_MEMBERS, IMG_AVATAR_DEFAULT, ANBU_DELAY_SECS } from "@/drizzle/constants";
import type { UserWithRelations } from "@/routers/profile";
import type { AnbuSquad } from "@/drizzle/schema";
import type { inferRouterOutputs } from "@trpc/server";
import type { DrizzleClient } from "@/server/db";

const pusher = getServerPusher();

export const anbuRouter = createTRPCRouter({
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [updatedUser, squad] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.id),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder, inSquad } = getConvenienceStatus(user, squad);
      // Hide orders if not kage or elder
      if (squad && !isKage && !isElder && !inSquad) {
        if (squad.kageOrder?.content) squad.kageOrder.content = "Hidden";
        if (squad.leaderOrder?.content) squad.leaderOrder.content = "Hidden";
      }
      // Guard
      if (squad && user && squad.villageId === user.villageId) {
        return squad;
      }
      return null;
    }),
  getAll: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Fetch
      const [user, squads] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchSquads(ctx.drizzle, input.villageId),
      ]);
      // Guard
      if (user && user.villageId === input.villageId) {
        return squads;
      }
      return null;
    }),
  getAllNames: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.anbuSquad.findMany({
      columns: { id: true, name: true, image: true },
    });
  }),
  getRequests: protectedProcedure.query(async ({ ctx }) => {
    return await fetchRequests(ctx.drizzle, ["ANBU"], 3600 * 12, ctx.userId);
  }),
  createRequest: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, squad] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.squadId),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder } = getConvenienceStatus(user, squad);
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!user) return errorResponse("User not found");
      if (!squad.leaderId) return errorResponse("No leader currently");
      if (user.villageId !== squad.villageId) return errorResponse("Wrong village");
      if (user.anbuId) return errorResponse("Already in a squad");
      if (isKage || isElder) return errorResponse("Kage or elder cannot join");
      if (!hasRequiredRank(user.rank, ANBU_MEMBER_RANK_REQUIREMENT)) {
        return errorResponse(`Rank must be at least ${ANBU_MEMBER_RANK_REQUIREMENT}`);
      }
      // Mutate
      await insertRequest(ctx.drizzle, user.userId, squad.leaderId, "ANBU");
      void pusher.trigger(squad.leaderId, "event", { type: "anbu" });
      // Create
      return { success: true, message: "User assigned to squad" };
    }),
  rejectRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "ANBU");
      if (request.receiverId !== ctx.userId) {
        return errorResponse("You can only reject requests for yourself");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only reject pending requests");
      }
      void pusher.trigger(request.senderId, "event", { type: "anbu" });
      return await updateRequestState(ctx.drizzle, input.id, "REJECTED", "ANBU");
    }),
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "ANBU");
      if (request.senderId !== ctx.userId) {
        return errorResponse("You can only cancel requests created by you");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only cancel pending requests");
      }
      void pusher.trigger(request.receiverId, "event", { type: "anbu" });
      return await updateRequestState(ctx.drizzle, input.id, "CANCELLED", "ANBU");
    }),
  acceptRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const request = await fetchRequest(ctx.drizzle, input.id, "ANBU");
      // Secondary fetches
      const [squad, requester, leader] = await Promise.all([
        fetchSquadByLeader(ctx.drizzle, request.receiverId),
        fetchUser(ctx.drizzle, request.senderId),
        fetchUser(ctx.drizzle, request.receiverId),
      ]);
      // Derived
      const nMembers = squad?.members.length || 0;
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!requester) return errorResponse("Requester not found");
      if (!leader) return errorResponse("Leader not found");
      if (nMembers >= ANBU_MAX_MEMBERS) return errorResponse("Squad is full");
      if (ctx.userId !== request.receiverId) return errorResponse("Not your request");
      if (ctx.userId !== squad.leaderId) return errorResponse("Not squad leader");
      if (requester.anbuId) return errorResponse("Requester already in a squad");
      if (requester.villageId !== leader.villageId) return errorResponse("!= village");
      if (requester.anbuId) return errorResponse("Already in a squad");
      if (!hasRequiredRank(leader.rank, ANBU_MEMBER_RANK_REQUIREMENT)) {
        return errorResponse(`Rank must be at least ${ANBU_MEMBER_RANK_REQUIREMENT}`);
      }
      // Mutate
      await Promise.all([
        updateRequestState(ctx.drizzle, input.id, "ACCEPTED", "ANBU"),
        ctx.drizzle
          .update(userData)
          .set({ anbuId: squad.id })
          .where(eq(userData.userId, requester.userId)),
      ]);
      void pusher.trigger(request.senderId, "event", { type: "anbu" });
      // Create
      return { success: true, message: "Request accepted" };
    }),
  createSquad: protectedProcedure
    .input(anbuCreateSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, leader, village, anbus] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchUser(ctx.drizzle, input.leaderId),
        fetchVillage(ctx.drizzle, input.villageId),
        fetchSquads(ctx.drizzle, input.villageId),
      ]);
      // Derived
      const { user } = updatedUser;
      const villageId = village?.id;
      const { isKage, isElder } = getConvenienceStatus(user);
      const structure = village?.structures.find((s) => s.name === "ANBU");
      // Guards
      if (!user) return errorResponse("User not found");
      if (!leader) return errorResponse("Leader not found");
      if (!village) return errorResponse("Village not found");
      if (!structure) return errorResponse("ANBU hall not found");
      if (!isKage && !isElder) return errorResponse("Not kage or elder");
      if (villageId !== user.villageId) return errorResponse("Wrong user village");
      if (villageId !== leader.villageId) return errorResponse("Wrong leader village");
      if (anbus.length > structure.level) return errorResponse("Max squads reached");
      if (leader.anbuId) return errorResponse("Leader already in a squad");
      if (leader.isAi) return errorResponse("AI cannot be leader");
      if (leader.userId === village.kageId) return errorResponse("Cannot choose kage");
      if (leader.rank === "ELDER") return errorResponse("Cannot choose elder");
      if (!hasRequiredRank(leader.rank, ANBU_LEADER_RANK_REQUIREMENT)) {
        return errorResponse("Leader rank too low");
      }
      // Mutate
      const anbuId = nanoid();
      await Promise.all([
        ctx.drizzle.insert(anbuSquad).values({
          id: anbuId,
          image: IMG_AVATAR_DEFAULT,
          villageId: village.id,
          name: input.name,
          leaderId: leader.userId,
          kageOrderId: nanoid(),
          leaderOrderId: nanoid(),
        }),
        ctx.drizzle
          .update(userData)
          .set({ anbuId: anbuId })
          .where(eq(userData.userId, leader.userId)),
      ]);
      // Create
      return { success: true, message: "Squad created" };
    }),
  disbandSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, squad] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.squadId),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder } = getConvenienceStatus(user, squad);
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!user) return errorResponse("User not found");
      if (user.villageId !== squad.villageId) return errorResponse("Wrong village");
      if (!isKage && !isElder) return errorResponse("Must be kage or elder");
      if (secondsFromDate(ANBU_DELAY_SECS, squad.createdAt) > new Date()) {
        return errorResponse("Must wait 24 hours after squad creation");
      }
      // Mutate
      await Promise.all([
        ctx.drizzle.delete(anbuSquad).where(eq(anbuSquad.id, squad.id)),
        ctx.drizzle
          .update(userData)
          .set({ anbuId: null })
          .where(eq(userData.anbuId, squad.id)),
      ]);
      // Create
      return { success: true, message: "Squad disbanded" };
    }),
  editSquad: protectedProcedure
    .input(z.object({ squadId: z.string(), name: z.string(), image: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, squad, image] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchSquad(ctx.drizzle, input.squadId),
        ctx.drizzle.query.historicalAvatar.findFirst({
          where: eq(historicalAvatar.avatar, input.image),
        }),
      ]);
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!user) return errorResponse("User not found");
      if (!image) return errorResponse("Image not found");
      if (!image.avatar) return errorResponse("Image not found");
      if (squad.leaderId !== user.userId) return errorResponse("Not squad leader");
      if (squad.villageId !== user.villageId) return errorResponse("Wrong village");
      if (user.anbuId !== squad.id) return errorResponse("Wrong squad");
      // Mutate
      await ctx.drizzle
        .update(anbuSquad)
        .set({ name: input.name, image: image.avatar })
        .where(eq(anbuSquad.id, squad.id));
      // Create
      return { success: true, message: "Squad name changed" };
    }),
  promoteMember: protectedProcedure
    .input(z.object({ squadId: z.string(), memberId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, squad, member] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.squadId),
        fetchUser(ctx.drizzle, input.memberId),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder } = getConvenienceStatus(user, squad);
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!user) return errorResponse("User not found");
      if (!member) return errorResponse("Member not found");
      if (!isKage && !isElder) return errorResponse("Not allowed");
      if (member.rank === "ELDER") return errorResponse("Cannot promote elder");
      if (member.anbuId !== squad.id) return errorResponse("Not in ANBU");
      if (!hasRequiredRank(member.rank, ANBU_LEADER_RANK_REQUIREMENT)) {
        return errorResponse("Leader rank too low");
      }
      // Mutate
      await ctx.drizzle
        .update(anbuSquad)
        .set({ leaderId: member.userId })
        .where(eq(anbuSquad.id, squad.id));
      // Create
      return { success: true, message: "Member promoted to leader" };
    }),
  kickMember: protectedProcedure
    .input(z.object({ squadId: z.string(), memberId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, squad, member] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.squadId),
        fetchUser(ctx.drizzle, input.memberId),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder, isLeader } = getConvenienceStatus(user, squad);
      // Guards
      if (!squad) return errorResponse("Squad not found");
      if (!user) return errorResponse("User not found");
      if (!member) return errorResponse("Member not found");
      if (squad.villageId !== user.villageId) return errorResponse("Wrong village");
      if (!isLeader && !isElder && !isKage) return errorResponse("Not allowed");
      // Mutate
      await removeFromSquad(ctx.drizzle, squad, member.userId);
      // Create
      return { success: true, message: "Member kicked" };
    }),
  leaveSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, squad] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchSquad(ctx.drizzle, input.squadId),
      ]);
      // Guards
      if (!user) return errorResponse("User not found");
      if (!squad) return errorResponse("Squad not found");
      if (user.villageId !== squad.villageId) return errorResponse("Wrong village");
      if (!user.anbuId) return errorResponse("Not in a squad");
      if (user.anbuId !== squad.id) return errorResponse("Wrong squad");
      // Derived
      await removeFromSquad(ctx.drizzle, squad, user.userId);
      // Create
      return { success: true, message: "User left squad" };
    }),
  upsertNotice: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        squadId: z.string(),
        type: z.enum(["KAGE", "LEADER"]),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, squad] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchSquad(ctx.drizzle, input.squadId),
      ]);
      // Derived
      const { user } = updatedUser;
      const { isKage, isElder, isLeader, village } = getConvenienceStatus(user, squad);
      // Guards
      if (!user) return errorResponse("User not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (user.isSilenced) return errorResponse("User is silenced");
      if (!squad) return errorResponse("Squad not found");
      if (!village) return errorResponse("Village not found");
      if (input.type === "KAGE") {
        if (!isKage && !isElder) return errorResponse("Not allowed");
      } else if (input.type === "LEADER") {
        if (!isLeader) return errorResponse("Not allowed");
      }
      const orderId = input.type === "KAGE" ? squad.kageOrderId : squad.leaderOrderId;
      // Update
      return updateNindo(ctx.drizzle, orderId, input.content, "anbuOrder");
    }),
});

/**
 * Removes a user from an ANBU squad.
 *
 * @param client - The DrizzleClient instance used for database operations.
 * @param squad - The ANBU squad from which the user will be removed.
 * @param userId - The ID of the user to be removed from the squad.
 */
const removeFromSquad = async (
  client: DrizzleClient,
  squad: NonNullable<AnbuRouter["get"]>,
  userId: string,
) => {
  // Derived
  const nMembers = squad?.members.length || 0;
  const otherUser = squad?.members
    .filter((m) => hasRequiredRank(m.rank, ANBU_LEADER_RANK_REQUIREMENT))
    .find((m) => m.userId !== userId);
  // Mutate
  await Promise.all([
    client.update(userData).set({ anbuId: null }).where(eq(userData.userId, userId)),
    client
      .update(anbuSquad)
      .set({ leaderId: otherUser?.userId ?? null })
      .where(eq(anbuSquad.id, squad.id)),
    ...(nMembers <= 1
      ? [
          client.delete(anbuSquad).where(eq(anbuSquad.id, squad.id)),
          client
            .update(userData)
            .set({ anbuId: null })
            .where(eq(userData.anbuId, squad.id)),
        ]
      : []),
  ]);
};

/**
 * Retrieves the convenience status of a user in an Anbu squad.
 * @param user - The user object with relations.
 * @param squad - The Anbu squad object.
 * @returns An object containing convenience status properties.
 */
const getConvenienceStatus = (
  user: UserWithRelations,
  squad: AnbuSquad | null = null,
) => {
  const isKage = user?.userId === user?.village?.kageId;
  const isElder = user?.rank === "ELDER";
  const isLeader = user?.userId === squad?.leaderId;
  const village = user?.village;
  const inSquad = user?.anbuId === squad?.id;
  return { isKage, isElder, isLeader, inSquad, village };
};

/**
 * Fetches squads based on the provided village ID.
 * @param client - The DrizzleClient instance used for querying.
 * @param villageId - The ID of the village to fetch squads for.
 * @returns A promise that resolves to an array of squads.
 */
export const fetchSquads = async (client: DrizzleClient, villageId: string) => {
  return await client.query.anbuSquad.findMany({
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
    where: eq(anbuSquad.villageId, villageId),
  });
};

/**
 * Fetches a squad from the database based on the squad ID.
 *
 * @param  client - The Drizzle client used to query the database.
 * @param  squadId - The ID of the squad to fetch.
 * @returns - A promise that resolves to the fetched squad, or null if not found.
 */
export const fetchSquad = async (client: DrizzleClient, squadId: string) => {
  return await client.query.anbuSquad.findFirst({
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
      kageOrder: true,
      leaderOrder: true,
    },
    where: eq(anbuSquad.id, squadId),
  });
};

/**
 * Fetches the squad details by leader ID.
 * @param client - The Drizzle client instance.
 * @param leaderId - The ID of the squad leader.
 * @returns - A promise that resolves to the squad details.
 */
export const fetchSquadByLeader = async (client: DrizzleClient, leaderId: string) => {
  return await client.query.anbuSquad.findFirst({
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
    where: eq(anbuSquad.leaderId, leaderId),
  });
};

export type AnbuRouter = inferRouterOutputs<typeof anbuRouter>;
