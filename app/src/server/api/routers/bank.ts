import { z } from "zod";
import { createTRPCRouter, protectedProcedure, baseServerResponse } from "../trpc";
import { fetchUser } from "@/routers/profile";
import { eq, and, gte, sql } from "drizzle-orm";
import { userData } from "@/drizzle/schema";

export const bankRouter = createTRPCRouter({
  toBank: protectedProcedure
    .input(z.object({ amount: z.number().min(0) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.money < input.amount) {
        return { success: false, message: "Not enough money in pocket" };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: sql`${userData.money} - ${input.amount}`,
          bank: sql`${userData.bank} + ${input.amount}`,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, input.amount)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in pocket" };
      }
      return { success: true, message: `Successfully deposited ${input.amount} ryo` };
    }),
  toPocket: protectedProcedure
    .input(z.object({ amount: z.number().min(0) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.bank < input.amount) {
        return { success: false, message: "Not enough money in bank" };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: sql`${userData.money} + ${input.amount}`,
          bank: sql`${userData.bank} - ${input.amount}`,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.bank, input.amount)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in bank" };
      }
      return { success: true, message: `Successfully withdrew ${input.amount} ryo` };
    }),
});
