import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, and } from "drizzle-orm";
import { jutsu, userJutsu, userData } from "../../../../drizzle/schema";
import { LetterRanks } from "../../../../drizzle/schema";
import { fetchUser } from "./profile";
import { canTrainJutsu, calcTrainTime, calcTrainCost } from "../../../libs/jutsu/jutsu";
import { calcJutsuEquipLimit } from "../../../libs/jutsu/jutsu";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError } from "../trpc";
import type { DrizzleClient } from "../../db";

export const jutsuRouter = createTRPCRouter({
  // Get all jutsu
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
  // Get all uset jutsu
  getUserJutsus: protectedProcedure.query(async ({ ctx }) => {
    return await fetchUserJutsus(ctx.drizzle, ctx.userId);
  }),
  // Start training a given jutsu
  startTraining: protectedProcedure
    .input(z.object({ jutsuId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const info = await ctx.drizzle.query.jutsu.findFirst({
        where: eq(jutsu.id, input.jutsuId),
      });
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
      return await ctx.drizzle.transaction(async (tx) => {
        const level = userjutsu ? userjutsu.level : 0;
        const trainTime = calcTrainTime(info, level);
        const trainCost = calcTrainCost(info, level);
        await tx
          .update(userData)
          .set({ money: sql`${userData.money} - ${trainCost}` })
          .where(eq(userData.userId, ctx.userId));
        if (userjutsu) {
          return await tx
            .update(userJutsu)
            .set({
              level: sql`${userJutsu.level} + 1`,
              finishTraining: new Date(Date.now() + trainTime),
              updatedAt: new Date(),
            })
            .where(
              and(eq(userJutsu.id, userjutsu.id), eq(userJutsu.userId, ctx.userId))
            );
        } else {
          return await tx.insert(userJutsu).values({
            id: nanoid(),
            userId: ctx.userId,
            jutsuId: input.jutsuId,
            finishTraining: new Date(Date.now() + trainTime),
          });
        }
      });
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

export const fetchUserJutsus = async (client: DrizzleClient, userId: string) => {
  return await client.query.userJutsu.findMany({
    with: { jutsu: true },
    where: eq(userJutsu.userId, userId),
  });
};
