import { z } from "zod";
import { eq, or, and, ne, sql, gte, isNull } from "drizzle-orm";
import {
  clan,
  userData,
  village,
  villageStructure,
  kageDefendedChallenges,
} from "@/drizzle/schema";
import { canChangeContent } from "@/utils/permissions";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { initiateBattle } from "@/routers/combat";
import { fetchVillage } from "@/routers/village";
import { fetchUser, fetchUpdatedUser, updateNindo } from "@/routers/profile";
import { canChallengeKage, canBeElder } from "@/utils/kage";
import { calcStructureUpgrade } from "@/utils/village";
import {
  KAGE_MAX_DAILIES,
  KAGE_MAX_ELDERS,
  KAGE_DELAY_SECS,
  KAGE_PRESTIGE_REQUIREMENT,
  KAGE_DEFAULT_PRESTIGE,
} from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import { secondsFromDate } from "@/utils/time";
import { fetchClan } from "@/routers/clan";

export const kageRouter = createTRPCRouter({
  fightKage: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village, previous] = await Promise.all([
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
      ]);
      const previousCount = previous?.[0]?.count ?? 0;
      // Guards
      if (!village) return errorResponse("Village not found");
      if (kage.villageId !== village.id) return errorResponse("No longer kage");
      if (kage.villageId !== user.villageId) return errorResponse("Wrong village");
      if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
      if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");
      if (previousCount >= KAGE_MAX_DAILIES) return errorResponse("Max for today");
      // Start the battle
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
      const [user, uVillage, elder] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        fetchKageReplacement(ctx.drizzle, input.villageId, ctx.userId),
      ]);
      // Guards
      if (!elder) return errorResponse("No elder found");
      if (!user) return errorResponse("User not found");
      if (!uVillage) return errorResponse("Village not found");
      if (uVillage.type !== "VILLAGE") return errorResponse("Only for villages");
      if (user.villageId !== villageId) return errorResponse("Wrong village");
      if (user.userId !== uVillage?.kageId) return errorResponse("Not kage");
      // Update
      await ctx.drizzle
        .update(village)
        .set({ kageId: elder.userId, leaderUpdatedAt: new Date() })
        .where(eq(village.id, user.villageId));
      return { success: true, message: "You have resigned as kage" };
    }),

  sendKagePrestige: protectedProcedure
    .input(z.object({ kageId: z.string(), amount: z.number() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
      ]);
      // Guards
      if (user.rank !== "ELDER") return errorResponse("Must be an elder");
      if (user.villageId !== kage.villageId) return errorResponse("Wrong village");
      if (input.amount <= 0) return errorResponse("Invalid amount");
      if (user.villagePrestige < input.amount) {
        return errorResponse("Not enough prestige");
      }
      // Create transfer request
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ villagePrestige: sql`${userData.villagePrestige} - ${input.amount}` })
          .where(eq(userData.userId, ctx.userId)),
        ctx.drizzle
          .update(userData)
          .set({ villagePrestige: sql`${userData.villagePrestige} + ${input.amount}` })
          .where(eq(userData.userId, input.kageId)),
      ]);
      return {
        success: true,
        message: `Sent ${input.amount} prestige to ${kage.username}`,
      };
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
          villagePrestige:
            user.villagePrestige > KAGE_DEFAULT_PRESTIGE
              ? user.villagePrestige
              : KAGE_DEFAULT_PRESTIGE,
        })
        .where(eq(userData.userId, user.userId)),
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
      const isHideoutOrTown = ["HIDEOUT", "TOWN"].includes(village?.type ?? "");
      const lockout = isHideoutOrTown ? KAGE_DELAY_SECS : 0;
      // Guards
      if (!user) return errorResponse("User not found");
      if (!village) return errorResponse("Village not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (user.isSilenced) return errorResponse("User is silenced");
      if (village.kageId !== ctx.userId) return errorResponse("Not kage");
      if (secondsFromDate(lockout, village.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been kage for 24 hours");
      }
      // Update
      return updateNindo(ctx.drizzle, village.id, input.content, "kageOrder");
    }),
  getElders: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchElders(ctx.drizzle, input.villageId);
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
      // Derived
      const isHideoutOrTown = ["HIDEOUT", "TOWN"].includes(village?.type ?? "");
      const lockout = isHideoutOrTown ? KAGE_DELAY_SECS : 0;
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
      if (secondsFromDate(lockout, village.leaderUpdatedAt) > new Date()) {
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
    .input(
      z.object({
        structureId: z.string(),
        villageId: z.string(),
        clanId: z.string().nullish(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, userVillage, clanData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchVillage(ctx.drizzle, input.villageId),
        input.clanId ? fetchClan(ctx.drizzle, input.clanId) : null,
      ]);

      // Derived
      const structure = userVillage?.structures.find((s) => s.id === input.structureId);
      const isHideoutOrTown = ["HIDEOUT", "TOWN"].includes(userVillage?.type ?? "");
      const lockout = isHideoutOrTown ? KAGE_DELAY_SECS : 0;

      // Guards
      if (!user) return errorResponse("User not found");
      if (!userVillage) return errorResponse("Village not found");
      if (!structure) return errorResponse("Structure not found");
      if (isHideoutOrTown && !clanData) return errorResponse("Faction not found");
      if (userVillage.kageId !== user.userId) return errorResponse("Not the leader");
      if (structure.level === 0) return errorResponse("Can't upgrade from lvl 0 yet");
      if (user.villageId !== structure.villageId) return errorResponse("Wrong village");
      if (!["VILLAGE", "TOWN"].includes(userVillage.type)) {
        return errorResponse("Only for villages");
      }
      if (clanData && clanData.id !== user.clanId) {
        return errorResponse("Not in faction");
      }
      if (secondsFromDate(lockout, userVillage.leaderUpdatedAt) > new Date()) {
        return errorResponse("Must have been in charge for 24 hours");
      }
      // Guard on cost & mutate
      const { total } = calcStructureUpgrade(structure, userVillage);
      if (isHideoutOrTown && clanData) {
        if (clanData.points < total) return errorResponse("Not enough clan points");
        const update = await ctx.drizzle
          .update(clan)
          .set({ points: sql`${clan.points} - ${total}` })
          .where(and(eq(clan.id, clanData.id), gte(clan.points, total)));
        if (update.rowsAffected === 0) return errorResponse("Point update failed");
      } else {
        if (userVillage.tokens < total) return errorResponse("Not enough tokens");
        const update = await ctx.drizzle
          .update(village)
          .set({ tokens: sql`${village.tokens} - ${total}` })
          .where(and(eq(village.id, input.villageId), gte(village.tokens, total)));
        if (update.rowsAffected === 0) return errorResponse("Token update failed");
      }
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

/**
 * Fetches a kage replacement from the user data table based on the provided village ID and current kage ID.
 * @param client - The DrizzleClient instance used for querying the database.
 * @param villageId - The ID of the village to fetch a replacement from.
 * @param currentKageId - The ID of the current kage.
 * @returns A Promise that resolves to a user data object representing the replacement kage.
 */
export const fetchKageReplacement = async (
  client: DrizzleClient,
  villageId: string,
  currentKageId: string,
) => {
  const elders = await client.query.userData.findMany({
    where: and(
      eq(userData.villageId, villageId),
      eq(userData.rank, "ELDER"),
      ne(userData.userId, currentKageId),
      isNull(userData.anbuId),
      or(
        gte(userData.villagePrestige, KAGE_PRESTIGE_REQUIREMENT),
        eq(userData.isAi, true),
      ),
    ),
  });
  const userElders = elders.filter((e) => !e.isAi);
  if (userElders.length > 0) {
    return userElders[Math.floor(Math.random() * userElders.length)];
  }
  return elders[Math.floor(Math.random() * elders.length)];
};
