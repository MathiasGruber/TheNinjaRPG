import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import { sql, eq, gte, and } from "drizzle-orm";
import { userData } from "../../../../drizzle/schema";
import { calcHealFinish } from "../../../libs/hospital/hospital";
import { calcHealCost } from "../../../libs/hospital/hospital";
import { fetchUser } from "./profile";
import type { ExecutedQuery } from "@planetscale/database";

export const hospitalRouter = createTRPCRouter({
  // Pay to heal
  heal: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const finishAt = calcHealFinish(user);
    let result: ExecutedQuery;
    if (finishAt <= new Date()) {
      result = await ctx.drizzle
        .update(userData)
        .set({
          curHealth: user.maxHealth,
          regenAt: new Date(),
          status: "AWAKE",
        })
        .where(
          and(eq(userData.userId, ctx.userId), eq(userData.status, "HOSPITALIZED"))
        );
    } else {
      const cost = calcHealCost(user);
      if (user.money < cost) {
        return { success: false, message: "You don't have enough money" };
      }
      result = await ctx.drizzle
        .update(userData)
        .set({
          curHealth: user.maxHealth,
          money: sql`${userData.money} - ${cost}`,
          regenAt: new Date(),
          status: "AWAKE",
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            gte(userData.money, cost),
            eq(userData.status, "HOSPITALIZED")
          )
        );
    }
    if (result.rowsAffected === 1) {
      return { success: true, message: "You have been healed" };
    } else {
      throw serverError("PRECONDITION_FAILED", "Something went wrong during healing");
    }
  }),
});
