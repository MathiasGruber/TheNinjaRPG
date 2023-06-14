import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { village, userData } from "../../../../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import type { DrizzleClient } from "../../db";

export const villageRouter = createTRPCRouter({
  // Get all villages
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await fetchVillages(ctx.drizzle);
  }),
  // Get a specific village & its structures
  get: publicProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const villageData = await fetchVillage(ctx.drizzle, input.id);
      const counts = await ctx.drizzle
        .select({ count: sql<number>`count(*)` })
        .from(userData)
        .where(eq(userData.villageId, input.id));
      const population = counts?.[0]?.count || 0;
      return { villageData, population };
    }),
});

export const fetchVillage = async (client: DrizzleClient, villageId: string) => {
  const entry = await client.query.village.findFirst({
    where: eq(village.id, villageId),
  });
  if (!entry) {
    throw new Error("Village not found");
  }
  return entry;
};

export const fetchVillages = async (client: DrizzleClient) => {
  return await client.query.village.findMany();
};
