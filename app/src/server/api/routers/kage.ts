import { z } from "zod";
import { eq, and, ne, sql, gte, isNull, lt } from "drizzle-orm";
import { userData, village, villageStructure, anbuSquad, kageDefendedChallenges, kagePrestige, kagePrestigeTransfer, kageChallengeRequest } from "@/drizzle/schema";
import { canChangeContent } from "@/utils/permissions";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { initiateBattle } from "@/routers/combat";
import { fetchVillage } from "@/routers/village";
import { fetchUser, fetchUpdatedUser, updateNindo } from "@/routers/profile";
import { canChallengeKage, canBeElder, isKage, updateKagePrestige, convertToKagePrestige } from "@/utils/kage";
import { calcStructureUpgrade } from "@/utils/village";
import {
  KAGE_MAX_DAILIES,
  KAGE_MAX_ELDERS,
  KAGE_DELAY_SECS,
  KAGE_MIN_PRESTIGE,
  KAGE_DAILY_PRESTIGE_LOSS,
  KAGE_ANBU_DELETE_COST,
  KAGE_WAR_DECLARE_COST,
  KAGE_CHALLENGE_TIMEOUT_MINS,
} from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import { secondsFromDate } from "@/utils/time";

export const kageRouter = createTRPCRouter({
  requestKageChallenge: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village, previous, existingRequest] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        fetchVillage(ctx.drizzle, input.villageId),
        ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(kageDefendedChallenges)
          .where(
            and(
              eq(kageDefendedChallenges.villageId, input.villageId),
              eq(kageDefendedChallenges.userId, ctx.userId),
              gte(kageDefendedChallenges.createdAt, sql`NOW() - INTERVAL 1 DAY`),
            ),
          ),
        ctx.drizzle.query.kageChallengeRequest.findFirst({
          where: and(
            eq(kageChallengeRequest.userId, ctx.userId),
            eq(kageChallengeRequest.villageId, input.villageId),
            gte(kageChallengeRequest.expiresAt, new Date()),
          ),
        }),
      ]);
      const previousCount = previous?.[0]?.count ?? 0;

      // Guards
      if (!village) return errorResponse("Village not found");
      if (kage.villageId !== village.id) return errorResponse("No longer kage");
      if (kage.villageId !== user.villageId) return errorResponse("Wrong village");
      if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
      if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");
      if (previousCount >= KAGE_MAX_DAILIES) return errorResponse("Max for today");
      if (existingRequest) return errorResponse("Already have a pending request");

      // Create challenge request
      await ctx.drizzle.insert(kageChallengeRequest).values({
        id: crypto.randomUUID(),
        userId: ctx.userId,
        villageId: input.villageId,
        kageId: input.kageId,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + KAGE_CHALLENGE_TIMEOUT_MINS * 60 * 1000),
      });

      return { success: true, message: "Challenge request sent" };
    }),

  acceptKageChallenge: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const request = await ctx.drizzle.query.kageChallengeRequest.findFirst({
        where: and(
          eq(kageChallengeRequest.id, input.requestId),
          eq(kageChallengeRequest.kageId, ctx.userId),
          gte(kageChallengeRequest.expiresAt, new Date()),
          eq(kageChallengeRequest.accepted, false),
        ),
      });

      // Guards
      if (!request) return errorResponse("Request not found or expired");

      // Update request
      await ctx.drizzle
        .update(kageChallengeRequest)
        .set({ accepted: true })
        .where(eq(kageChallengeRequest.id, input.requestId));

      // Start the battle
      return await initiateBattle(
        {
          userIds: [request.userId],
          targetIds: [ctx.userId],
          client: ctx.drizzle,
          asset: "arena",
        },
        "KAGE_CHALLENGE",
      );
    }),

  fightKage: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village, previous, request] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        fetchVillage(ctx.drizzle, input.villageId),
        ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(kageDefendedChallenges)
          .where(
            and(
              eq(kageDefendedChallenges.villageId, input.villageId),
              eq(kageDefendedChallenges.userId, ctx.userId),
              gte(kageDefendedChallenges.createdAt, sql`NOW() - INTERVAL 1 DAY`),
            ),
          ),
        ctx.drizzle.query.kageChallengeRequest.findFirst({
          where: and(
            eq(kageChallengeRequest.userId, ctx.userId),
            eq(kageChallengeRequest.kageId, input.kageId),
            lt(kageChallengeRequest.expiresAt, new Date()),
            eq(kageChallengeRequest.accepted, false),
          ),
        }),
      ]);
      const previousCount = previous?.[0]?.count ?? 0;

      // Guards
      if (!village) return errorResponse("Village not found");
      if (kage.villageId !== village.id) return errorResponse("No longer kage");
      if (kage.villageId !== user.villageId) return errorResponse("Wrong village");
      if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
      if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");
      if (previousCount >= KAGE_MAX_DAILIES) return errorResponse("Max for today");
      if (!request) return errorResponse("No expired challenge request found");

      // Start AI battle
      return await initiateBattle(
        {
          userIds: [ctx.userId],
          targetIds: [kage.userId],
          client: ctx.drizzle,
          asset: "arena",

        },
        "KAGE_CHALLENGE",
      );
    }),
  resignKage: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Destructure
      const villageId = input.villageId;
      // Fetch
      const [user, uVillage, elders] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        ctx.drizzle.query.userData.findMany({
          where: and(
            eq(userData.villageId, villageId),
            eq(userData.rank, "ELDER"),
            ne(userData.userId, ctx.userId),
            isNull(userData.anbuId),
          ),
        }),
      ]);
      // Derived
      const elder = elders[Math.floor(Math.random() * elders.length)];
      // Guards
      if (!elder) return errorResponse("No elder found");
      if (!user) return errorResponse("User not found");
      if (!uVillage) return errorResponse("Village not found");
      if (uVillage.type !== "VILLAGE") return errorResponse("Only for villages");
      if (user.villageId !== villageId) return errorResponse("Wrong village");
      if (user.userId !== uVillage?.kageId) return errorResponse("Not kage");
      // Update
      await Promise.all([
        ctx.drizzle
          .update(village)
          .set({ kageId: elder.userId, leaderUpdatedAt: new Date() })
          .where(eq(village.id, user.villageId)),
        ctx.drizzle
          .delete(kagePrestige)
          .where(eq(kagePrestige.userId, user.userId)),
      ]);
      return { success: true, message: "You have resigned as kage" };
    }),

  sendKagePrestige: protectedProcedure
    .input(z.object({ kageId: z.string(), amount: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [{ user }, { user: kage }] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        fetchUpdatedUser({ client: ctx.drizzle, userId: input.kageId }),
      ]);

      // Guards
      if (!user) return errorResponse("User not found");
      if (!kage) return errorResponse("Kage not found");
      if (user.rank !== "ELDER") return errorResponse("Must be an elder");
      if (user.villageId !== kage.villageId) return errorResponse("Wrong village");
      if (!isKage(kage)) return errorResponse("Not kage");
      if (input.amount <= 0) return errorResponse("Invalid amount");
      if (user.villagePrestige < input.amount) return errorResponse("Not enough prestige");

      // Create transfer request
      await ctx.drizzle.insert(kagePrestigeTransfer).values({
        id: crypto.randomUUID(),
        fromUserId: ctx.userId,
        toUserId: input.kageId,
        villageId: user.villageId!,
        amount: input.amount,
        createdAt: new Date(),
      });

      return { success: true, message: "Prestige transfer request sent" };
    }),

  acceptPrestigeTransfer: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [{ user }, transfer] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        ctx.drizzle.query.kagePrestigeTransfer.findFirst({
          where: and(
            eq(kagePrestigeTransfer.id, input.transferId),
            eq(kagePrestigeTransfer.toUserId, ctx.userId),
            eq(kagePrestigeTransfer.accepted, false),
          ),
        }),
      ]);

      // Guards
      if (!user) return errorResponse("User not found");
      if (!transfer) return errorResponse("Transfer not found");
      if (!isKage(user)) return errorResponse("Not kage");

      // Update prestige
      const [kagePrestigeRecord] = await Promise.all([
        ctx.drizzle.query.kagePrestige.findFirst({
          where: eq(kagePrestige.userId, ctx.userId),
        }),
        ctx.drizzle
          .update(kagePrestigeTransfer)
          .set({ accepted: true })
          .where(eq(kagePrestigeTransfer.id, input.transferId)),
        ctx.drizzle
          .update(userData)
          .set({
            villagePrestige: sql`${userData.villagePrestige} - ${transfer.amount}`,
          })
          .where(eq(userData.userId, transfer.fromUserId)),
      ]);

      if (kagePrestigeRecord) {
        await ctx.drizzle
          .update(kagePrestige)
          .set({
            prestige: sql`${kagePrestige.prestige} + ${transfer.amount}`,
          })
          .where(eq(kagePrestige.userId, ctx.userId));
      } else {
        await ctx.drizzle.insert(kagePrestige).values({
          id: crypto.randomUUID(),
          userId: ctx.userId,
          villageId: user.villageId!,
          prestige: 5000 + transfer.amount,
          createdAt: new Date(),
          lastPrestigeUpdate: new Date(),
        });
      }

      return { success: true, message: "Prestige transfer accepted" };
    }),
  takeKage: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    // Fetch
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });
    // Guards
    if (!user) return errorResponse("User not found");
    if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
    if (user.village?.type !== "VILLAGE") return errorResponse("Only for villages");
    if (!canChangeContent(user.role)) return errorResponse("Not staff");
    // Update
    const [result] = await Promise.all([
      ctx.drizzle
        .update(village)
        .set({ kageId: user.userId, leaderUpdatedAt: new Date() })
        .where(eq(village.id, user.villageId ?? "")),
      ctx.drizzle
        .update(userData)
        .set({
          rank: sql`CASE WHEN ${userData.rank} = 'ELDER' THEN 'JONIN' ELSE ${userData.rank} END`,
        })
        .where(eq(userData.userId, user.userId)),
      ctx.drizzle.insert(kagePrestige).values({
        id: crypto.randomUUID(),
        userId: user.userId,
        villageId: user.villageId!,
        prestige: 5000,
        createdAt: new Date(),
        lastPrestigeUpdate: new Date(),
      }),
    ]);
    if (result.rowsAffected === 0) return errorResponse("No village found");
    return { success: true, message: "You have taken the kage position" };
  }),
  upsertNotice: protectedProcedure
    .input(z.object({ content: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const village = user?.village;
      // Guards
      if (!user) return errorResponse("User not found");
      if (!village) return errorResponse("Village not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (user.isSilenced) return errorResponse("User is silenced");
      if (village.kageId !== ctx.userId) return errorResponse("Not kage");
      if (secondsFromDate(KAGE_DELAY_SECS, village.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been kage for 24 hours");
      }
      // Update
      return updateNindo(ctx.drizzle, village.id, input.content, "kageOrder");
    }),

  deleteAnbuSquad: protectedProcedure
    .input(z.object({ squadId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const { user } = await fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId });
      if (!user) return errorResponse("User not found");
      if (!isKage(user)) return errorResponse("Not kage");

      const squadId = input.squadId;
      const squad = await ctx.drizzle.query.anbuSquad.findFirst({
        where: eq(anbuSquad.id, squadId),
        columns: {
          id: true,
          villageId: true,
        },
      });
      if (!squad?.id || !squad.villageId) return errorResponse("Squad not found");
      if (user.villageId !== squad.villageId) return errorResponse("Wrong village");

      const kagePrestigeRecord = await ctx.drizzle.query.kagePrestige.findFirst({
        where: eq(kagePrestige.userId, ctx.userId),
      });
      if (!kagePrestigeRecord) return errorResponse("No kage prestige found");

      // Update prestige based on time elapsed
      const { prestige, shouldRemove } = await updateKagePrestige(ctx.drizzle, kagePrestigeRecord);
      if (shouldRemove) {
        await Promise.all([
          ctx.drizzle
            .update(village)
            .set({ kageId: null, leaderUpdatedAt: new Date() })
            .where(eq(village.id, user.villageId!)),
          ctx.drizzle
            .delete(kagePrestige)
            .where(eq(kagePrestige.userId, ctx.userId)),
        ]);
        return errorResponse("Kage prestige too low, you have been removed from office");
      }

      if (prestige < KAGE_ANBU_DELETE_COST) {
        return errorResponse("Not enough kage prestige");
      }

      // Update
      const deleteResult = await ctx.drizzle.delete(anbuSquad).where(eq(anbuSquad.id, squad.id));
      if (deleteResult.rowsAffected === 0) return errorResponse("Failed to delete squad");

      const updateResult = await ctx.drizzle
        .update(kagePrestige)
        .set({
          prestige: sql`${kagePrestige.prestige} - ${KAGE_ANBU_DELETE_COST}`,
        })
        .where(eq(kagePrestige.userId, ctx.userId));
      if (updateResult.rowsAffected === 0) return errorResponse("Failed to update prestige");

      return { success: true, message: "ANBU squad deleted" };
    }),

  declareWar: protectedProcedure
    .input(z.object({ targetVillageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [{ user }, targetVillage, kagePrestigeRecord] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        fetchVillage(ctx.drizzle, input.targetVillageId),
        ctx.drizzle.query.kagePrestige.findFirst({
          where: eq(kagePrestige.userId, ctx.userId),
        }),
      ]);

      // Guards
      if (!user) return errorResponse("User not found");
      if (!targetVillage) return errorResponse("Target village not found");
      if (!kagePrestigeRecord) return errorResponse("No kage prestige found");
      if (!isKage(user)) return errorResponse("Not kage");
      if (user.villageId === input.targetVillageId) {
        return errorResponse("Cannot declare war on your own village");
      }

      // Update prestige based on time elapsed
      const { prestige, shouldRemove } = await updateKagePrestige(ctx.drizzle, kagePrestigeRecord);
      if (shouldRemove) {
        await Promise.all([
          ctx.drizzle
            .update(village)
            .set({ kageId: null, leaderUpdatedAt: new Date() })
            .where(eq(village.id, user.villageId!)),
          ctx.drizzle
            .delete(kagePrestige)
            .where(eq(kagePrestige.userId, ctx.userId)),
        ]);
        return errorResponse("Kage prestige too low, you have been removed from office");
      }

      if (prestige < KAGE_WAR_DECLARE_COST) {
        return errorResponse("Not enough kage prestige");
      }

      // Update
      await ctx.drizzle
        .update(kagePrestige)
        .set({
          prestige: sql`${kagePrestige.prestige} - ${KAGE_WAR_DECLARE_COST}`,
        })
        .where(eq(kagePrestige.userId, ctx.userId));

      // TODO: Implement war declaration logic

      return { success: true, message: "War declared" };
    }),

  convertVillagePrestige: protectedProcedure
    .input(z.object({ amount: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const { user } = await fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId });

      // Guards
      if (!user) return errorResponse("User not found");
      if (!isKage(user)) return errorResponse("Not kage");
      if (input.amount <= 0) return errorResponse("Invalid amount");
      if (user.villagePrestige < input.amount) return errorResponse("Not enough village prestige");

      // Convert prestige
      const newPrestige = await convertToKagePrestige(
        ctx.drizzle,
        ctx.userId,
        user.villageId!,
        input.amount,
      );

      // Update user's village prestige
      await ctx.drizzle
        .update(userData)
        .set({
          villagePrestige: sql`${userData.villagePrestige} - ${input.amount}`,
        })
        .where(eq(userData.userId, ctx.userId));

      return { success: true, message: `Converted ${input.amount} village prestige to Kage prestige` };
    }),

  getKagePrestige: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.drizzle.query.kagePrestige.findFirst({
        where: eq(kagePrestige.userId, input.userId),
      });
    }),

  getKagePrestigeTransfers: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.drizzle.query.kagePrestigeTransfer.findMany({
        where: and(
          eq(kagePrestigeTransfer.toUserId, input.userId),
          eq(kagePrestigeTransfer.accepted, false),
        ),
      });
    }),
  getElders: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchElders(ctx.drizzle, input.villageId);
    }),

  updateKagePrestige: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [{ user }, kagePrestigeRecord] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: input.userId }),
        ctx.drizzle.query.kagePrestige.findFirst({
          where: eq(kagePrestige.userId, input.userId),
        }),
      ]);

      // Guards
      if (!user) return errorResponse("User not found");
      if (!kagePrestigeRecord) return errorResponse("No kage prestige found");
      if (!isKage(user)) return errorResponse("Not kage");

      // Calculate days since last update
      const daysSinceUpdate = Math.floor(
        (new Date().getTime() - new Date(kagePrestigeRecord.lastPrestigeUpdate).getTime()) /
          (1000 * 3600 * 24),
      );

      if (daysSinceUpdate === 0) {
        return { success: true, message: "Prestige already updated today" };
      }

      // Calculate new prestige
      const prestigeLoss = daysSinceUpdate * KAGE_DAILY_PRESTIGE_LOSS;
      const newPrestige = Math.max(0, kagePrestigeRecord.prestige - prestigeLoss);

      // Update prestige
      await ctx.drizzle
        .update(kagePrestige)
        .set({
          prestige: newPrestige,
          lastPrestigeUpdate: new Date(),
        })
        .where(eq(kagePrestige.userId, input.userId));

      // Remove kage if prestige is too low
      if (newPrestige < KAGE_MIN_PRESTIGE) {
        const elders = await fetchElders(ctx.drizzle, user.villageId!);
        const elder = elders[Math.floor(Math.random() * elders.length)];

        if (elder) {
          await Promise.all([
            ctx.drizzle
              .update(village)
              .set({ kageId: elder.userId, leaderUpdatedAt: new Date() })
              .where(eq(village.id, user.villageId!)),
            ctx.drizzle.delete(kagePrestige).where(eq(kagePrestige.userId, input.userId)),
          ]);
          return { success: true, message: "Kage removed due to low prestige" };
        }
      }

      return { success: true, message: "Prestige updated" };
    }),
  toggleElder: protectedProcedure
    .input(z.object({ userId: z.string(), villageId: z.string().nullish() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const villageId = input.villageId ?? "syndicate";
      const [kage, prospect, village, elders] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
        fetchVillage(ctx.drizzle, villageId),
        fetchElders(ctx.drizzle, villageId),
      ]);
      // Guards
      if (!kage) return errorResponse("User not found");
      if (!prospect) return errorResponse("Target not found");
      if (!village) return errorResponse("Village not found");
      if (prospect.anbuId) return errorResponse("Cannot promote ANBU to elder");
      if (prospect.isAi) return errorResponse("Do not touch the AI");
      if (kage.villageId !== village.id) return errorResponse("Wrong village");
      if (village.kageId !== kage.userId) return errorResponse("Not kage");
      if (village.type !== "VILLAGE") return errorResponse("Only for village");
      if (prospect.villageId !== village.id) return errorResponse("Not in village");
      if (elders.length > KAGE_MAX_ELDERS) {
        return errorResponse(`Already have ${KAGE_MAX_ELDERS} elders`);
      }
      if (secondsFromDate(KAGE_DELAY_SECS, village.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been kage for 24 hours");
      }
      if (prospect.rank !== "ELDER" && !canBeElder(prospect)) {
        return errorResponse("Must be in village for 100 days to be elder");
      }
      // Mutate
      const newRank = prospect.rank === "ELDER" ? "JONIN" : "ELDER";
      await ctx.drizzle
        .update(userData)
        .set({ rank: newRank })
        .where(eq(userData.userId, prospect.userId));
      return {
        success: true,
        message: `User rank updated to ${newRank.toLowerCase()}`,
      };
    }),
  upgradeStructure: protectedProcedure
    .input(z.object({ structureId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, userVillage] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);

      // Derived
      const structure = userVillage?.structures.find((s) => s.id === input.structureId);

      // Guards
      if (!user) return errorResponse("User not found");
      if (!userVillage) return errorResponse("Village not found");
      if (!structure) return errorResponse("Structure not found");
      if (userVillage.kageId !== user.userId) return errorResponse("Not the kage");
      if (structure.level === 0) return errorResponse("Can't upgrade from lvl 0 yet");
      if (user.villageId !== structure.villageId) return errorResponse("Wrong village");
      if (userVillage.type !== "VILLAGE") return errorResponse("Only for villages");
      const { total } = calcStructureUpgrade(structure, userVillage);
      if (userVillage.tokens < total) return errorResponse("Not enough tokens");
      if (secondsFromDate(KAGE_DELAY_SECS, userVillage.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been kage for 24 hours");
      }
      // Mutate cost
      const villageUpdate = await ctx.drizzle
        .update(village)
        .set({ tokens: sql`${village.tokens} - ${total}` })
        .where(and(eq(village.id, input.villageId), gte(village.tokens, total)));
      if (villageUpdate.rowsAffected === 0) return errorResponse("1st update failed");

      // If success, upgrade structure
      const result = await ctx.drizzle
        .update(villageStructure)
        .set({ level: structure.level + 1 })
        .where(
          and(
            eq(villageStructure.id, input.structureId),
            eq(villageStructure.villageId, user.villageId),
          ),
        );
      if (result.rowsAffected === 0) return errorResponse("Upgrade failed");

      return { success: true, message: "Structure upgraded" };
    }),
});

/**
 * Fetches the elders from the user data table based on the provided village ID.
 * @param client - The DrizzleClient instance used for querying the database.
 * @param villageId - The ID of the village to fetch elders from.
 * @returns A Promise that resolves to an array of elder user data objects.
 */
export const fetchElders = async (client: DrizzleClient, villageId: string) => {
  return await client.query.userData.findMany({
    columns: {
      username: true,
      userId: true,
      villageId: true,
      avatar: true,
      level: true,
      rank: true,
      isOutlaw: true,
    },
    where: and(
      eq(userData.villageId, villageId),
      eq(userData.rank, "ELDER"),
      eq(userData.isAi, false),
    ),
  });
};
