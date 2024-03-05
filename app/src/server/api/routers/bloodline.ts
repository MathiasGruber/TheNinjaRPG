import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, gte, and, inArray, isNotNull } from "drizzle-orm";
import { LetterRanks } from "@/drizzle/constants";
import { userData } from "@/drizzle/schema";
import { bloodline, bloodlineRolls, actionLog } from "@/drizzle/schema";
import { userJutsu, jutsu } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/api/trpc";
import { serverError, baseServerResponse } from "@/api/trpc";
import { fetchUser, fetchUpdatedUser } from "@/routers/profile";
import { BloodlineValidator } from "@/libs/combat/types";
import { getRandomElement } from "@/utils/array";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { effectFilters, statFilters } from "@/libs/train";
import { ROLL_CHANCE, REMOVAL_COST, BLOODLINE_COST } from "@/libs/bloodline";
import { COST_SWAP_BLOODLINE } from "@/libs/profile";
import HumanDiff from "human-object-diff";
import type { ZodAllTags } from "@/libs/combat/types";
import type { BloodlineRank, UserData } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

export const bloodlineRouter = createTRPCRouter({
  getAllNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.bloodline.findMany({
      columns: { id: true, name: true, image: true },
    });
  }),
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
        rank: z.enum(LetterRanks).optional(),
        showHidden: z.boolean().optional().nullable(),
        effect: z.string().optional(),
        stat: z.enum(statFilters).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.effect && !(effectFilters as string[]).includes(input.effect)) {
        throw serverError("PRECONDITION_FAILED", `Invalid filter: ${input.effect}`);
      }
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.bloodline.findMany({
        where: and(
          ...[input.rank ? eq(bloodline.rank, input.rank) : isNotNull(bloodline.rank)],
          ...(input.showHidden ? [] : [eq(bloodline.hidden, 0)]),
          ...(input.effect
            ? [sql`JSON_SEARCH(${bloodline.effects},'one',${input.effect}) IS NOT NULL`]
            : []),
          ...(input.stat
            ? [sql`JSON_SEARCH(${bloodline.effects},'one',${input.stat}) IS NOT NULL`]
            : []),
        ),
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  // Get a specific bloodline
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchBloodline(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Bloodline not found");
      }
      return result as Omit<typeof result, "effects"> & { effects: ZodAllTags[] };
    }),
  // Create new bloodline
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(bloodline).values({
        id: id,
        name: "New Bloodline",
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        description: "New bloodline description",
        effects: [],
        village: "All",
        rank: "D",
        hidden: 1,
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create bloodline` };
    }
  }),
  // Delete a bloodline
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchBloodline(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await ctx.drizzle.delete(bloodline).where(eq(bloodline.id, input.id));
        await ctx.drizzle
          .update(userData)
          .set({ bloodlineId: null })
          .where(eq(userData.bloodlineId, input.id));
        return { success: true, message: `Bloodline deleted` };
      } else {
        return { success: false, message: `Not allowed to delete bloodline` };
      }
    }),
  // Update a bloodline
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: BloodlineValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchBloodline(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const newData = {
          ...input.data,
          effects: input.data.effects.map((e) => {
            delete e.rounds;
            delete e.friendlyFire;
            return e;
          }),
        };
        const diff = new HumanDiff({ objectName: "bloodline" }).diff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...newData,
        });
        // Update database
        await ctx.drizzle
          .update(bloodline)
          .set(newData)
          .where(eq(bloodline.id, input.id));
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "bloodline",
          changes: diff,
          relatedId: entry.id,
          relatedMsg: `Update: ${entry.name}`,
          relatedImage: entry.image,
        });
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit bloodline` };
      }
    }),
  // Get bloodline roll of a specific user
  getRolls: protectedProcedure
    .input(z.object({ currentBloodlineId: z.string().optional().nullable() }))
    .query(async ({ ctx }) => {
      return (await fetchBloodlineRoll(ctx.drizzle, ctx.userId)) ?? null;
    }),
  // Roll a bloodline
  roll: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const prevRoll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
    if (prevRoll) {
      throw serverError("PRECONDITION_FAILED", "You have already rolled a bloodline");
    }
    const rand = Math.random();
    let bloodlineRank: BloodlineRank | undefined = undefined;
    if (rand < ROLL_CHANCE["S"]) {
      bloodlineRank = "S";
    } else if (rand < ROLL_CHANCE["A"]) {
      bloodlineRank = "A";
    } else if (rand < ROLL_CHANCE["B"]) {
      bloodlineRank = "B";
    } else if (rand < ROLL_CHANCE["C"]) {
      bloodlineRank = "C";
    } else if (rand < ROLL_CHANCE["D"]) {
      bloodlineRank = "D";
    }
    // Update roll & user if successfull
    if (bloodlineRank) {
      const randomBloodline = getRandomElement(
        await ctx.drizzle.query.bloodline.findMany({
          where: and(eq(bloodline.rank, bloodlineRank), eq(bloodline.hidden, 0)),
        }),
      );
      if (randomBloodline) {
        await ctx.drizzle
          .update(userData)
          .set({ bloodlineId: randomBloodline.id })
          .where(eq(userData.userId, ctx.userId));
        await ctx.drizzle.insert(bloodlineRolls).values({
          id: nanoid(),
          userId: ctx.userId,
          bloodlineId: randomBloodline.id,
        });
        return {
          success: true,
          message: "After thorough examination a bloodline was detected",
        };
      }
    } else {
      await ctx.drizzle.insert(bloodlineRolls).values({
        id: nanoid(),
        userId: ctx.userId,
      });
    }
    return {
      success: false,
      message: "After thorough examination the doctors conclude you have no bloodline",
    };
  }),
  // Remove a bloodline from session user
  removeBloodline: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const roll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
    if (!user.bloodlineId) {
      throw serverError("PRECONDITION_FAILED", "You do not have a bloodline");
    }
    if (user.bloodlineId === roll?.bloodlineId) {
      return await ctx.drizzle
        .update(userData)
        .set({ bloodlineId: null })
        .where(eq(userData.userId, ctx.userId));
    } else {
      if (user.reputationPoints < REMOVAL_COST) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      await updateBloodline(ctx.drizzle, user, null, REMOVAL_COST);
    }
  }),
  // Purchase a bloodline for session user
  purchaseBloodline: protectedProcedure
    .input(z.object({ bloodlineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const roll = await fetchBloodlineRoll(ctx.drizzle, ctx.userId);
      const line = await fetchBloodline(ctx.drizzle, input.bloodlineId);
      if (!roll) {
        throw serverError("PRECONDITION_FAILED", "You have not rolled a bloodline");
      }
      if (!line) {
        throw serverError("PRECONDITION_FAILED", "Bloodline does not exist");
      }
      if (BLOODLINE_COST[line.rank] > user.reputationPoints) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      return await ctx.drizzle
        .update(userData)
        .set({
          reputationPoints: user.reputationPoints - BLOODLINE_COST[line.rank],
          bloodlineId: line.id,
        })
        .where(eq(userData.userId, ctx.userId));
    }),
  // Swap a bloodline for another of similar rank
  swapBloodline: protectedProcedure
    .input(z.object({ bloodlineId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user || !user.bloodline) {
        throw serverError("PRECONDITION_FAILED", "User does not exist");
      }
      const line = await fetchBloodline(ctx.drizzle, input.bloodlineId);
      if (!line) {
        throw serverError("PRECONDITION_FAILED", "Bloodline does not exist");
      }
      if (line.rank !== user.bloodline.rank) {
        throw serverError("PRECONDITION_FAILED", "Bloodline ranks are not the same");
      }
      const cost = COST_SWAP_BLOODLINE;
      if (cost > user.reputationPoints) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      await updateBloodline(ctx.drizzle, user, line.id, cost);
    }),
});

/**
 * Update bloodline of user, ensuring the current blooline jutsus are unequipped
 */

export const updateBloodline = async (
  client: DrizzleClient,
  user: UserData,
  bloodlineId: string | null,
  repCost: number,
) => {
  // Get current bloodline jutsus
  const bloodlineJutsus = user.bloodlineId
    ? (
        await client.query.jutsu.findMany({
          columns: { id: true },
          where: eq(jutsu.bloodlineId, user.bloodlineId),
        })
      ).map((j) => j.id)
    : [];
  // Run queries in parallel
  await Promise.all([
    // Update bloodline jutsus currently being trained
    ...(bloodlineJutsus.length > 0
      ? [
          client
            .update(userJutsu)
            .set({
              level: sql`CASE WHEN finishTraining > NOW() THEN level - 1 ELSE level END`,
            })
            .where(
              and(
                eq(userJutsu.userId, user.userId),
                inArray(userJutsu.jutsuId, bloodlineJutsus),
              ),
            ),
        ]
      : []),
    // Update user to remove bloodline
    client
      .update(userData)
      .set({
        bloodlineId: bloodlineId,
        reputationPoints: user.reputationPoints - repCost,
      })
      .where(
        and(eq(userData.userId, user.userId), gte(userData.reputationPoints, repCost)),
      ),
  ]);
  // Update the training timer & equipped states.
  // This has to be done after level update, otherwise level update wont use the correct finishTraining value
  await client
    .update(userJutsu)
    .set({ finishTraining: null, equipped: 0 })
    .where(
      and(
        eq(userJutsu.userId, user.userId),
        inArray(userJutsu.jutsuId, bloodlineJutsus),
      ),
    );
};
/**
 * COMMON QUERIES WHICH ARE REUSED
 */
export const fetchBloodlineRoll = async (client: DrizzleClient, userId: string) => {
  return await client.query.bloodlineRolls.findFirst({
    where: eq(bloodlineRolls.userId, userId),
    with: { bloodline: true },
  });
};

export const fetchBloodline = async (client: DrizzleClient, bloodlineId: string) => {
  return await client.query.bloodline.findFirst({
    where: eq(bloodline.id, bloodlineId),
  });
};
