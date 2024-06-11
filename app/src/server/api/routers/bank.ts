import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { errorResponse, baseServerResponse } from "../trpc";
import { fetchUser } from "@/routers/profile";
import { eq, or, and, gte, sql, desc } from "drizzle-orm";
import { userData, bankTransfers } from "@/drizzle/schema";
import { RYO_CAP } from "@/drizzle/constants";

export const bankRouter = createTRPCRouter({
  toBank: protectedProcedure
    .input(z.object({ amount: z.number().min(0) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Derived
      const raw = input.amount;
      const value = user.bank + raw > RYO_CAP ? RYO_CAP - user.bank : raw;
      // Guard
      if (user.money < value) return errorResponse("Not enough money in pocket");
      if (user.isBanned) return errorResponse("You are banned");
      // Update
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: sql`${userData.money} - ${value}`,
          bank: sql`${userData.bank} + ${value}`,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, value)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in pocket" };
      }
      return { success: true, message: `Successfully deposited ${value} ryo` };
    }),
  toPocket: protectedProcedure
    .input(z.object({ amount: z.number().min(0) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Derived
      const raw = input.amount;
      const value = user.money + raw > RYO_CAP ? RYO_CAP - user.money : raw;
      // Guard
      if (user.bank < value) return errorResponse("Not enough money in bank");
      if (user.isBanned) return errorResponse("You are banned");
      // Update
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: sql`${userData.money} + ${value}`,
          bank: sql`${userData.bank} - ${value}`,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.bank, value)));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Not enough money in bank" };
      }
      return { success: true, message: `Successfully withdrew ${value} ryo` };
    }),
  transfer: protectedProcedure
    .input(z.object({ amount: z.number().min(0), targetId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [target, user] = await Promise.all([
        fetchUser(ctx.drizzle, input.targetId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Derived
      const raw = input.amount;
      const value = target.bank + raw > RYO_CAP ? RYO_CAP - target.bank : raw;
      // Guard
      if (user.bank < value) return errorResponse("Not enough money in bank");
      if (user.isBanned) return errorResponse("You are banned");
      // Update
      const result = await ctx.drizzle
        .update(userData)
        .set({ bank: sql`${userData.bank} - ${value}` })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.bank, value)));
      if (result.rowsAffected === 0) return errorResponse("Not enough money in bank");
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ bank: sql`${userData.bank} + ${value}` })
          .where(eq(userData.userId, input.targetId)),
        ctx.drizzle.insert(bankTransfers).values({
          senderId: ctx.userId,
          receiverId: input.targetId,
          amount: value,
        }),
      ]);
      return {
        success: true,
        message: `Successfully transferred ${value} ryo to ${target.username}`,
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
