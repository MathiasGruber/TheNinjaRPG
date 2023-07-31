import { z } from "zod";
import { eq, sql, asc } from "drizzle-orm";
import { userJutsu } from "../../../../drizzle/schema";
import { dataBattleAction } from "../../../../drizzle/schema";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { fetchJutsu } from "./jutsu";

export const dataRouter = createTRPCRouter({
  getStatistics: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
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
      const usage = await ctx.drizzle
        .select({
          battleWon: dataBattleAction.battleWon,
          battleType: dataBattleAction.battleType,
          count: sql<number>`COUNT(${dataBattleAction.id})`.mapWith(Number),
        })
        .from(dataBattleAction)
        .groupBy(dataBattleAction.battleWon, dataBattleAction.battleType)
        .where(eq(dataBattleAction.contentId, input.id));
      const total = await ctx.drizzle
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(userJutsu)
        .where(eq(userJutsu.jutsuId, input.id));
      const totalUsers = total?.[0]?.count || 0;
      return { jutsu: info, usage, totalUsers, levelDistribution };
    }),
});
