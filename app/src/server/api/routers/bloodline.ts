import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, gte, and, inArray } from "drizzle-orm";
import { LetterRanks } from "../../../../drizzle/constants";
import { userData } from "../../../../drizzle/schema";
import { bloodline, bloodlineRolls, actionLog } from "../../../../drizzle/schema";
import { userJutsu, jutsu } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import { fetchUser } from "./profile";
import { BloodlineValidator } from "../../../libs/combat/types";
import { getRandomElement } from "../../../utils/array";
import { canChangeContent } from "../../../utils/permissions";
import { callDiscord } from "../../../libs/discord";
import { ROLL_CHANCE, REMOVAL_COST, BLOODLINE_COST } from "../../../libs/bloodline";
import HumanDiff from "human-object-diff";
import type { ZodAllTags } from "../../../libs/combat/types";
import type { BloodlineRank } from "../../../../drizzle/schema";
import type { DrizzleClient } from "../../db";

export const bloodlineRouter = createTRPCRouter({
  getAllNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.bloodline.findMany({
      columns: { id: true, name: true },
    });
  }),
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        rank: z.enum(LetterRanks),
        showHidden: z.boolean().optional().nullable(),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.bloodline.findMany({
        where: and(
          eq(bloodline.rank, input.rank),
          ...(input.showHidden ? [] : [eq(bloodline.hidden, 0)])
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
        const diff = new HumanDiff({ objectName: "bloodline" }).diff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await ctx.drizzle
          .update(bloodline)
          .set(input.data)
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
          await callDiscord(user.username, entry.name, diff, entry.image);
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
  roll: protectedProcedure.mutation(async ({ ctx }) => {
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
    let bloodlineId: null | string = null;
    if (bloodlineRank) {
      const randomBloodline = getRandomElement(
        await ctx.drizzle.query.bloodline.findMany({
          where: and(eq(bloodline.rank, bloodlineRank), eq(bloodline.hidden, 0)),
        })
      );
      if (randomBloodline) {
        bloodlineId = randomBloodline.id;
        await ctx.drizzle
          .update(userData)
          .set({ bloodlineId: randomBloodline.id })
          .where(eq(userData.userId, ctx.userId));
        await ctx.drizzle.insert(bloodlineRolls).values({
          id: nanoid(),
          userId: ctx.userId,
          bloodlineId: randomBloodline.id,
        });
      }
    } else {
      await ctx.drizzle.insert(bloodlineRolls).values({
        id: nanoid(),
        userId: ctx.userId,
      });
    }
    return { bloodlineId: bloodlineId };
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
      const bloodlineJutsus = (
        await ctx.drizzle.query.jutsu.findMany({
          columns: { id: true },
          where: eq(jutsu.bloodlineId, user.bloodlineId),
        })
      ).map((j) => j.id);
      // Run queries in parallel
      await Promise.all([
        // Update bloodline jutsus currently being trianed
        ctx.drizzle
          .update(userJutsu)
          .set({ finishTraining: null })
          .where(
            and(
              eq(userJutsu.userId, ctx.userId),
              inArray(userJutsu.jutsuId, bloodlineJutsus)
            )
          ),
        // Update user to remove bloodline
        ctx.drizzle
          .update(userData)
          .set({
            bloodlineId: null,
            reputationPoints: user.reputationPoints - REMOVAL_COST,
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              gte(userData.reputationPoints, REMOVAL_COST)
            )
          ),
      ]);
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
});

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
