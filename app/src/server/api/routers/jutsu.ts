import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, and, gte } from "drizzle-orm";
import { jutsu, userJutsu, userData, actionLog } from "../../../../drizzle/schema";
import { LetterRanks } from "../../../../drizzle/constants";
import { fetchUser } from "./profile";
import { canTrainJutsu } from "../../../libs/train";
import { calcJutsuTrainTime, calcJutsuTrainCost } from "../../../libs/train";
import { calcJutsuEquipLimit } from "../../../libs/train";
import { JutsuValidator } from "../../../libs/combat/types";
import { canChangeContent } from "../../../utils/permissions";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import HumanDiff from "human-object-diff";
import type { ZodAllTags } from "../../../libs/combat/types";
import type { DrizzleClient } from "../../db";

export const jutsuRouter = createTRPCRouter({
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchJutsu(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Jutsu not found");
      }
      return result as Omit<typeof result, "effects"> & { effects: ZodAllTags[] };
    }),
  getAll: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        rarity: z.enum(LetterRanks),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.jutsu.findMany({
        where: eq(jutsu.jutsuRank, input.rarity),
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  // Create new jutsu
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(jutsu).values({
        id: id,
        name: "New Jutsu",
        description: "New jutsu description",
        battleDescription: "%user uses %jutsu on %target",
        effects: [],
        range: 1,
        requiredRank: "STUDENT",
        target: "OTHER_USER",
        jutsuType: "AI",
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create jutsu` };
    }
  }),
  // Delete a jutsu
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchJutsu(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await ctx.drizzle.delete(jutsu).where(eq(jutsu.id, input.id));
        await ctx.drizzle.delete(userJutsu).where(eq(userJutsu.jutsuId, input.id));
        return { success: true, message: `Jutsu deleted` };
      } else {
        return { success: false, message: `Not allowed to delete jutsu` };
      }
    }),
  // Update a jutsu
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: JutsuValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchJutsu(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = new HumanDiff({ objectName: "jutsu" }).diff(entry, {
          id: entry.id,
          updatedAt: entry.updatedAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Update database
        await ctx.drizzle.update(jutsu).set(input.data).where(eq(jutsu.id, input.id));
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "jutsu",
          changes: diff,
        });
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit jutsu` };
      }
    }),
  // Get all uset jutsu
  getUserJutsus: protectedProcedure.query(async ({ ctx }) => {
    return await fetchUserJutsus(ctx.drizzle, ctx.userId);
  }),
  // Start training a given jutsu
  startTraining: protectedProcedure
    .input(z.object({ jutsuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const info = await fetchJutsu(ctx.drizzle, input.jutsuId);
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const userjutsu = userjutsus.find((j) => j.jutsuId === input.jutsuId);
      if (!info) {
        throw serverError("NOT_FOUND", "Jutsu not found");
      }
      if (!canTrainJutsu(info, user)) {
        throw serverError("NOT_FOUND", "You cannot train this jutsu");
      }
      if (userjutsus.find((j) => j.finishTraining && j.finishTraining > new Date())) {
        throw serverError("NOT_FOUND", "You are already training a jutsu");
      }

      const level = userjutsu ? userjutsu.level : 0;
      const trainTime = calcJutsuTrainTime(info, level);
      const trainCost = calcJutsuTrainCost(info, level);
      await ctx.drizzle
        .update(userData)
        .set({ money: sql`${userData.money} - ${trainCost}` })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, trainCost)));
      if (userjutsu) {
        return await ctx.drizzle
          .update(userJutsu)
          .set({
            level: sql`${userJutsu.level} + 1`,
            finishTraining: new Date(Date.now() + trainTime),
            updatedAt: new Date(),
          })
          .where(and(eq(userJutsu.id, userjutsu.id), eq(userJutsu.userId, ctx.userId)));
      } else {
        return await ctx.drizzle.insert(userJutsu).values({
          id: nanoid(),
          userId: ctx.userId,
          jutsuId: input.jutsuId,
          finishTraining: new Date(Date.now() + trainTime),
        });
      }
    }),
  // Toggle whether an item is equipped
  toggleEquip: protectedProcedure
    .input(z.object({ userJutsuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userjutsus = await fetchUserJutsus(ctx.drizzle, ctx.userId);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const userjutsu = userjutsus.find((j) => j.id === input.userJutsuId);
      const isEquipped = userjutsu?.equipped || false;
      const curEquip = userjutsus?.filter((j) => j.equipped).length || 0;
      const maxEquip = userData && calcJutsuEquipLimit(user);
      if (!userjutsu) {
        throw serverError("NOT_FOUND", "Jutsu not found");
      }
      if (!isEquipped && curEquip >= maxEquip) {
        throw serverError("PRECONDITION_FAILED", "You cannot equip more jutsu");
      }
      return await ctx.drizzle
        .update(userJutsu)
        .set({
          equipped: userjutsu.equipped === 0 ? 1 : 0,
        })
        .where(eq(userJutsu.id, input.userJutsuId));
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchJutsu = async (client: DrizzleClient, id: string) => {
  return await client.query.jutsu.findFirst({
    where: eq(jutsu.id, id),
  });
};

export const fetchUserJutsus = async (client: DrizzleClient, userId: string) => {
  return await client.query.userJutsu.findMany({
    with: { jutsu: true },
    where: eq(userJutsu.userId, userId),
  });
};
