import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { baseServerResponse, serverError } from "../trpc";
import { village, userData, kageDefendedChallenges } from "@/drizzle/schema";
import { eq, sql, gte, and } from "drizzle-orm";
import { ramenOptions } from "@/utils/ramen";
import { getRamenHealPercentage, calcRamenCost } from "@/utils/ramen";
import { fetchUser, fetchRegeneratedUser } from "./profile";
import { COST_SWAP_VILLAGE } from "@/libs/profile";
import { ALLIANCEHALL_LONG, ALLIANCEHALL_LAT } from "@/libs/travel/constants";
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
      // Fetch in parallel
      const [villageData, counts, defendedChallenges] = await Promise.all([
        fetchVillage(ctx.drizzle, input.id),
        ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userData)
          .where(eq(userData.villageId, input.id)),
        ctx.drizzle.query.kageDefendedChallenges.findMany({
          with: {
            user: {
              columns: {
                username: true,
                userId: true,
                avatar: true,
              },
            },
          },
          where: eq(kageDefendedChallenges.villageId, input.id),
        }),
      ]);
      // Guards
      if (!villageData) throw serverError("NOT_FOUND", "Village not found");
      // Derived
      const population = counts?.[0]?.count || 0;
      // Return
      return { villageData, population, defendedChallenges };
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
  swapVillage: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Queries
      const { user } = await fetchRegeneratedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      // Guards
      if (!user) {
        return { success: false, message: "User does not exist" };
      }
      const village = await fetchVillage(ctx.drizzle, input.villageId);
      if (!village) {
        return { success: false, message: "Village does not exist" };
      }
      if (user.villageId === village.kageId) {
        return { success: false, message: "You can not leave your village when kage" };
      }
      if (user.villageId === village.id) {
        return { success: false, message: "You are already in this village" };
      }
      if (user.status !== "AWAKE") {
        return { success: false, message: "You must be awake." };
      }
      const cost = COST_SWAP_VILLAGE;
      if (cost > user.reputationPoints) {
        return { success: false, message: "You do not have enough reputation points" };
      }
      // Update
      await ctx.drizzle
        .update(userData)
        .set({
          villageId: village.id,
          reputationPoints: user.reputationPoints - cost,
          villagePrestige: 0,
          sector: village.sector,
          longitude: ALLIANCEHALL_LONG,
          latitude: ALLIANCEHALL_LAT,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            gte(userData.reputationPoints, cost),
            eq(userData.status, "AWAKE"),
          ),
        );
      return { success: true, message: "You have swapped villages" };
    }),
  getAlliances: publicProcedure.query(async ({ ctx }) => {
    const [villages, alliances] = await Promise.all([
      fetchVillages(ctx.drizzle),
      ctx.drizzle.query.villageAlliance.findMany(),
    ]);
    return { villages, alliances };
  }),
});

export const fetchVillage = async (client: DrizzleClient, villageId: string) => {
  return await client.query.village.findFirst({
    where: eq(village.id, villageId),
    with: {
      structures: {
        orderBy: (structure, { desc }) => desc(structure.name),
      },
      kage: {
        columns: {
          username: true,
          userId: true,
          avatar: true,
        },
      },
    },
  });
};

export const fetchVillages = async (client: DrizzleClient) => {
  return await client.query.village.findMany();
};
