import { z } from "zod";
import { and, eq, sql, asc, isNotNull } from "drizzle-orm";
import { userJutsu, userItem, userData } from "../../../../drizzle/schema";
import { dataBattleAction, jutsu } from "../../../../drizzle/schema";
import { createTRPCRouter, publicProcedure, serverError } from "../trpc";
import { fetchJutsu } from "./jutsu";
import { fetchBloodline } from "./bloodline";
import { fetchItem } from "./item";
import { fetchUser } from "./profile";
import { BattleTypes } from "@/drizzle/constants";

export const dataRouter = createTRPCRouter({
  getJutsuBalanceStatistics: publicProcedure
    .input(z.object({ battleType: z.enum(BattleTypes) }))
    .query(async ({ ctx, input }) => {
      const usage = await ctx.drizzle
        .select({
          name: jutsu.name,
          battleWon: dataBattleAction.battleWon,
          count: sql<number>`COUNT(${dataBattleAction.id})`.mapWith(Number),
        })
        .from(dataBattleAction)
        .leftJoin(jutsu, eq(dataBattleAction.contentId, jutsu.id))
        .groupBy(jutsu.name, dataBattleAction.battleWon, dataBattleAction.battleType)
        .where(
          and(
            eq(dataBattleAction.type, "jutsu"),
            isNotNull(jutsu.name),
            eq(dataBattleAction.battleType, input.battleType)
          )
        );
      return usage;
    }),
  getStatistics: publicProcedure
    .input(
      z.object({
        id: z.string(),
        type: z.enum(["jutsu", "item", "bloodline", "basic", "ai"]),
      })
    )
    .query(async ({ ctx, input }) => {
      // General User Statistics
      const usage = await ctx.drizzle
        .select({
          battleWon: dataBattleAction.battleWon,
          battleType: dataBattleAction.battleType,
          count: sql<number>`COUNT(${dataBattleAction.id})`.mapWith(Number),
        })
        .from(dataBattleAction)
        .groupBy(dataBattleAction.battleWon, dataBattleAction.battleType)
        .where(eq(dataBattleAction.contentId, input.id));
      // Process different inputs
      if (input.type === "jutsu") {
        // Jutsu Statistics
        const info = await fetchJutsu(ctx.drizzle, input.id);
        const levelDistribution = await ctx.drizzle
          .select({
            level: userJutsu.level,
            count: sql<number>`COUNT(${userJutsu.userId})`.mapWith(Number),
          })
          .from(userJutsu)
          .groupBy(userJutsu.level)
          .where(eq(userJutsu.jutsuId, input.id))
          .orderBy(asc(userJutsu.level));
        const total = await ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userJutsu)
          .where(eq(userJutsu.jutsuId, input.id));
        const totalUsers = total?.[0]?.count || 0;
        return { info, usage, totalUsers, levelDistribution };
      } else if (input.type === "bloodline") {
        // Bloodline Statistics
        const info = await fetchBloodline(ctx.drizzle, input.id);
        const levelDistribution = await ctx.drizzle
          .select({
            level: userData.level,
            count: sql<number>`COUNT(${userData.userId})`.mapWith(Number),
          })
          .from(userData)
          .groupBy(userData.level)
          .where(eq(userData.bloodlineId, input.id))
          .orderBy(asc(userData.level));
        const total = await ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userData)
          .where(eq(userData.bloodlineId, input.id));
        const totalUsers = total?.[0]?.count || 0;
        return { info, usage, totalUsers, levelDistribution };
      } else if (input.type === "item") {
        // Item Statistics
        const info = await fetchItem(ctx.drizzle, input.id);
        const total = await ctx.drizzle
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(userItem)
          .where(eq(userItem.id, input.id));
        const totalUsers = total?.[0]?.count || 0;
        return { info, usage, totalUsers, levelDistribution: null };
      } else if (input.type === "ai") {
        // AI Statistics
        const info = await fetchUser(ctx.drizzle, input.id);
        return { info, usage, totalUsers: null, levelDistribution: null };
      } else {
        throw serverError("BAD_REQUEST", `Invalid input type: ${input.type}`);
      }
    }),
});
