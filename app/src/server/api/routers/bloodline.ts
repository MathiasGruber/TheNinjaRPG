import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, or, sql, gte, and, inArray, isNull, isNotNull, like } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { bloodline, bloodlineRolls, actionLog } from "@/drizzle/schema";
import { userJutsu, jutsu } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/api/trpc";
import { serverError, baseServerResponse, errorResponse } from "@/api/trpc";
import { fetchUser, fetchUpdatedUser } from "@/routers/profile";
import { BloodlineValidator } from "@/libs/combat/types";
import { getRandomElement } from "@/utils/array";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { ROLL_CHANCE, REMOVAL_COST, BLOODLINE_COST } from "@/libs/bloodline";
import { COST_SWAP_BLOODLINE } from "@/drizzle/constants";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { canSwapBloodline } from "@/utils/permissions";
import { calculateContentDiff } from "@/utils/diff";
import { bloodlineFilteringSchema } from "@/validators/bloodline";
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
      bloodlineFilteringSchema.extend({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      console.log(input);
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.bloodline.findMany({
        with: { village: { columns: { name: true } } },
        where: and(
          ...(input.name ? [like(bloodline.name, `%${input.name}%`)] : []),
          ...(input.classification
            ? [eq(bloodline.statClassification, input.classification)]
            : []),
          ...(input.village ? [eq(bloodline.villageId, input.village)] : []),
          ...(input.stat && input.stat.length > 0
            ? [
                and(
                  ...input.stat.map(
                    (s) =>
                      sql`JSON_SEARCH(${bloodline.effects},'one',${s}) IS NOT NULL`,
                  ),
                ),
              ]
            : []),
          ...(input.effect && input.effect.length > 0
            ? [
                or(
                  ...input.effect.map(
                    (e) =>
                      sql`JSON_SEARCH(${bloodline.effects},'one',${e}) IS NOT NULL`,
                  ),
                ),
              ]
            : []),
          ...[input.rank ? eq(bloodline.rank, input.rank) : isNotNull(bloodline.rank)],
          ...(input.element && input.element.length > 0
            ? [
                and(
                  ...input.element.map(
                    (e) =>
                      sql`JSON_SEARCH(${bloodline.effects},'one',${e},NULL,'$[*].elements') IS NOT NULL`,
                  ),
                ),
              ]
            : []),
          ...(input?.hidden !== undefined
            ? [eq(bloodline.hidden, input.hidden)]
            : [eq(bloodline.hidden, false)]),
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
        image: IMG_AVATAR_DEFAULT,
        description: "New bloodline description",
        effects: [],
        rank: "D",
        hidden: true,
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
        const diff = calculateContentDiff(entry, {
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
      return (await fetchNaturalBloodlineRoll(ctx.drizzle, ctx.userId)) ?? null;
    }),
  // Roll a bloodline
  roll: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const [user, prevRoll] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      fetchNaturalBloodlineRoll(ctx.drizzle, ctx.userId),
    ]);
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
          where: and(
            eq(bloodline.rank, bloodlineRank),
            eq(bloodline.hidden, false),
            or(
              eq(bloodline.villageId, user.villageId ?? ""),
              isNull(bloodline.villageId),
            ),
          ),
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
    const roll = await fetchNaturalBloodlineRoll(ctx.drizzle, ctx.userId);
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
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, line] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchBloodline(ctx.drizzle, input.bloodlineId),
      ]);
      // Guard
      if (!line) return errorResponse("Bloodline does not exist");
      if (user.bloodlineId) {
        return errorResponse("Already have bloodline, please remove first");
      }
      if (BLOODLINE_COST[line.rank] > user.reputationPoints) {
        throw serverError("FORBIDDEN", "You do not have enough reputation points");
      }
      if (line.villageId && line.villageId !== user.villageId) {
        return errorResponse("Bloodline does not belong to your village");
      }
      // Update
      await ctx.drizzle
        .update(userData)
        .set({
          reputationPoints: user.reputationPoints - BLOODLINE_COST[line.rank],
          bloodlineId: line.id,
        })
        .where(eq(userData.userId, ctx.userId));
      return { success: true, message: "Bloodline purchased" };
    }),
  // Swap a bloodline for another of similar rank
  swapBloodline: protectedProcedure
    .input(z.object({ bloodlineId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [updatedUser, line] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchBloodline(ctx.drizzle, input.bloodlineId),
      ]);
      const user = updatedUser.user;
      // Guards
      if (!user) return errorResponse("User does not exist");
      if (!line) return errorResponse("Bloodline does not exist");
      if (!user.bloodline) return errorResponse("User does not have a bloodline");
      if (line.rank !== user.bloodline.rank) {
        return errorResponse("Bloodline ranks are not the same");
      }
      if (COST_SWAP_BLOODLINE > user.reputationPoints) {
        return errorResponse("Not enough reputation points");
      }
      if (!canSwapBloodline(user.role)) {
        return errorResponse("Not allowed to swap bloodline");
      }
      // Update
      await updateBloodline(ctx.drizzle, user, line.id, COST_SWAP_BLOODLINE);
      return { success: true, message: "Bloodline swapped" };
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
export const fetchNaturalBloodlineRoll = async (
  client: DrizzleClient,
  userId: string,
) => {
  return await client.query.bloodlineRolls.findFirst({
    where: and(eq(bloodlineRolls.userId, userId), eq(bloodlineRolls.type, "NATURAL")),
    with: { bloodline: true },
  });
};

export const fetchItemBloodlineRolls = async (
  client: DrizzleClient,
  userId: string,
) => {
  return await client.query.bloodlineRolls.findMany({
    where: and(eq(bloodlineRolls.userId, userId), eq(bloodlineRolls.type, "ITEM")),
    with: { bloodline: true },
  });
};

export const fetchBloodline = async (client: DrizzleClient, bloodlineId: string) => {
  return await client.query.bloodline.findFirst({
    where: eq(bloodline.id, bloodlineId),
  });
};
