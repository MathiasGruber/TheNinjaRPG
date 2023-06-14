import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { sql } from "drizzle-orm";
import { userData } from "../../../../drizzle/schema";
import { calcHealFinish } from "../../../libs/hospital/hospital";
import { calcHealCost } from "../../../libs/hospital/hospital";
import { fetchUser } from "./profile";

export const hospitalRouter = createTRPCRouter({
  // Pay to heal
  heal: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const finishAt = calcHealFinish(user);
    if (finishAt < new Date()) {
      return await ctx.drizzle.update(userData).set({
        curHealth: user.maxHealth,
        regenAt: new Date(),
        status: "AWAKE",
      });
    } else {
      const cost = calcHealCost(user);
      if (user.money < cost) {
        throw serverError("PRECONDITION_FAILED", "You don't have enough money");
      }
      return await ctx.drizzle.update(userData).set({
        curHealth: user.maxHealth,
        money: sql`${userData.money} - ${cost}`,
        regenAt: new Date(),
        status: "AWAKE",
      });
    }
  }),
});
