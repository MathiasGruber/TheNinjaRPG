import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { baseServerResponse, serverError } from "../trpc";
import { village, userData } from "@/drizzle/schema";
import { eq, sql, gte, and } from "drizzle-orm";
import { ramenOptions } from "@/utils/ramen";
import { getRamenHealPercentage, calcRamenCost } from "@/utils/ramen";
import { fetchUser } from "./profile";
import type { DrizzleClient } from "../../db";

export const villageRouter = createTRPCRouter({
  // Get all villages
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await fetchVillages(ctx.drizzle);
  }),
  // Get a specific village & its structures
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const villageData = await fetchVillage(ctx.drizzle, input.id);
      if (!villageData) {
        throw serverError("NOT_FOUND", "Village not found");
      }
      const counts = await ctx.drizzle
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(userData)
        .where(eq(userData.villageId, input.id));
      const population = counts?.[0]?.count || 0;
      return { villageData, population };
    }),
  // Buying food in ramen shop
  buyFood: protectedProcedure
    .input(z.object({ ramen: z.enum(ramenOptions) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const healPercentage = getRamenHealPercentage(input.ramen);
      const cost = calcRamenCost(input.ramen, user);
      if (user.money >= cost) {
        const result = await ctx.drizzle
          .update(userData)
          .set({
            money: user.money - cost,
            curHealth: user.curHealth + (user.maxHealth * healPercentage) / 100,
          })
          .where(and(eq(userData.userId, ctx.userId), gte(userData.money, cost)));
        if (result.rowsAffected === 0) {
          return { success: false, message: "Error trying to buy food. Try again." };
        } else {
          return { success: true, message: "You have bought food" };
        }
      } else {
        return { success: false, message: "You don't have enough money" };
      }
    }),
});

export const fetchVillage = async (client: DrizzleClient, villageId: string) => {
  return await client.query.village.findFirst({
    where: eq(village.id, villageId),
    with: { structures: true },
  });
};

export const fetchVillages = async (client: DrizzleClient) => {
  return await client.query.village.findMany();
};
