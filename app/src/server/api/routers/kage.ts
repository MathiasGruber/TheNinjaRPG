import { z } from "zod";
import { eq, and, ne, sql, gte, isNull } from "drizzle-orm";
import { userData, village, villageStructure } from "@/drizzle/schema";
import { canChangeContent } from "@/utils/permissions";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { initiateBattle, determineArenaBackground } from "@/routers/combat";
import { fetchVillage } from "@/routers/village";
import { fetchUser, fetchUpdatedUser, updateNindo } from "@/routers/profile";
import { canChallengeKage } from "@/utils/kage";
import { calcStructureUpgrade } from "@/utils/village";
import type { DrizzleClient } from "@/server/db";

export const kageRouter = createTRPCRouter({
  fightKage: protectedProcedure
    .input(z.object({ kageId: z.string(), villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, kage, village] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.kageId),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);
      // Guards
      if (!village) return errorResponse("Village not found");
      if (kage.villageId !== village.id) return errorResponse("No longer kage");
      if (kage.villageId !== user.villageId) return errorResponse("Wrong village");
      if (user.anbuId) return errorResponse("Cannot be kage while in ANBU");
      if (!canChallengeKage(user)) return errorResponse("Not eligible to challenge");
      // Start the battle
      return await initiateBattle(
        {
          userId: ctx.userId,
          targetId: kage.userId,
          client: ctx.drizzle,
        },
        "KAGE",
        determineArenaBackground(village?.name || "Unknown"),
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
      if (user.villageId !== villageId) return errorResponse("Wrong village");
      if (user.userId !== uVillage?.kageId) return errorResponse("Not kage");
      // Update
      await ctx.drizzle
        .update(village)
        .set({ kageId: elder.userId })
        .where(eq(village.id, user.villageId));
      return { success: true, message: "You have resigned as kage" };
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
    if (!canChangeContent(user.role)) return errorResponse("Not staff");
    // Update
    const [result] = await Promise.all([
      ctx.drizzle
        .update(village)
        .set({ kageId: user.userId })
        .where(eq(village.id, user.villageId ?? "")),
      ctx.drizzle
        .update(userData)
        .set({
          rank: sql`CASE WHEN ${userData.rank} = 'ELDER' THEN 'JONIN' ELSE ${userData.rank} END`,
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
      // Guards
      if (!user) return errorResponse("User not found");
      if (!village) return errorResponse("Village not found");
      if (user.isBanned) return errorResponse("User is banned");
      if (village.kageId !== ctx.userId) return errorResponse("Not kage");
      // Update
      return updateNindo(ctx.drizzle, village.id, input.content);
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
      // Guards
      if (!kage) return errorResponse("User not found");
      if (!prospect) return errorResponse("Target not found");
      if (!village) return errorResponse("Village not found");
      if (prospect.anbuId) return errorResponse("Cannot promote ANBU to elder");
      if (prospect.isAi) return errorResponse("Do not touch the AI");
      if (kage.villageId !== village.id) return errorResponse("Wrong village");
      if (village.kageId !== kage.userId) return errorResponse("Not kage");
      if (prospect.villageId !== village.id) return errorResponse("Not in village");
      if (elders.length > 3) return errorResponse("Already have 3 elders");
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
      const cost = calcStructureUpgrade(structure);
      if (userVillage.tokens < cost) return errorResponse("Not enough tokens");

      // Mutate cost
      const villageUpdate = await ctx.drizzle
        .update(village)
        .set({ tokens: sql`${village.tokens} - ${cost}` })
        .where(and(eq(village.id, input.villageId), gte(village.tokens, cost)));
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
      eq(userData.isAi, 0),
    ),
  });
};
