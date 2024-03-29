import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { serverError, baseServerResponse, errorResponse } from "@/server/api/trpc";
import { sql, eq, gte, and } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { calcHealFinish } from "@/libs/hospital/hospital";
import { calcHealCost } from "@/libs/hospital/hospital";
import { fetchUser } from "@/routers/profile";
import { fetchStructures } from "@/routers/village";
import { calcStructureContribution } from "@/utils/village";
import type { ExecutedQuery } from "@planetscale/database";

export const hospitalRouter = createTRPCRouter({
  // Pay to heal & get out of hospital
  heal: protectedProcedure
    .input(z.object({ villageId: z.string().nullish() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, structures] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchStructures(ctx.drizzle, input.villageId),
      ]);
      // Guard
      if (user.villageId !== input.villageId) {
        return errorResponse("You are not in this village");
      }
      // Calc finish
      const boost = calcStructureContribution("hospitalSpeedupPerLvl", structures);
      const finishAt = calcHealFinish({ user, boost });
      // Mutate w. validation
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
            and(eq(userData.userId, ctx.userId), eq(userData.status, "HOSPITALIZED")),
          );
      } else {
        const cost = calcHealCost(user);
        if (user.money < cost) {
          return errorResponse("You don't have enough money");
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
              eq(userData.status, "HOSPITALIZED"),
            ),
          );
      }
      if (result.rowsAffected === 1) {
        return { success: true, message: "You have been healed" };
      } else {
        throw serverError("PRECONDITION_FAILED", "Something went wrong during healing");
      }
    }),
});
