import { z } from "zod";
import { createTRPCRouter, protectedProcedure, baseServerResponse } from "../trpc";
import { fetchUser } from "@/routers/profile";
import { eq, or, and, gte, sql, desc } from "drizzle-orm";
import { userData, bankTransfers } from "@/drizzle/schema";

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
  transfer: protectedProcedure
    .input(z.object({ amount: z.number().min(0), targetId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const target = await fetchUser(ctx.drizzle, input.targetId);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.bank < input.amount) {
        return { success: false, message: "Not enough money in bank" };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({ bank: sql`${userData.bank} - ${input.amount}` })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.bank, input.amount)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in bank" };
      }
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ bank: sql`${userData.bank} + ${input.amount}` })
          .where(eq(userData.userId, input.targetId)),
        ctx.drizzle.insert(bankTransfers).values({
          senderId: ctx.userId,
          receiverId: input.targetId,
          amount: input.amount,
        }),
      ]);
      return {
        success: true,
        message: `Successfully transferred ${input.amount} ryo to ${target.username}`,
      };
    }),
  getTransfers: protectedProcedure
    .input(
      z.object({
        senderId: z.string().optional().nullish(),
        receiverId: z.string().optional().nullish(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const transfers = await ctx.drizzle.query.bankTransfers.findMany({
        where: or(
          input.senderId ? eq(bankTransfers.senderId, input.senderId) : undefined,
          input.receiverId ? eq(bankTransfers.receiverId, input.receiverId) : undefined,
        ),
        with: {
          sender: { columns: { username: true } },
          receiver: { columns: { username: true } },
        },
        offset: skip,
        limit: input.limit,
        orderBy: desc(bankTransfers.createdAt),
      });
      const nextCursor = transfers.length < input.limit ? null : currentCursor + 1;
      return {
        data: transfers,
        nextCursor: nextCursor,
      };
    }),
});
