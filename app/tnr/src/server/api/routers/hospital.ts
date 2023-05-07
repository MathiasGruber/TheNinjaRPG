import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { calcHealFinish } from "../../../libs/hospital/hospital";
import { calcHealCost } from "../../../libs/hospital/hospital";
import { fetchUser } from "./profile";
import { UserStatus } from "@prisma/client";

export const hospitalRouter = createTRPCRouter({
  // Pay to heal
  heal: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.prisma, ctx.userId);
    const finishAt = calcHealFinish(user);
    if (finishAt < new Date()) {
      return await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: {
          cur_health: user.max_health,
          regenAt: new Date(),
          status: UserStatus.AWAKE,
        },
      });
    } else {
      const cost = calcHealCost(user);
      if (user.money < cost) {
        throw serverError("PRECONDITION_FAILED", "You don't have enough money");
      }
      return await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: {
          cur_health: user.max_health,
          money: user.money - cost,
          regenAt: new Date(),
          status: UserStatus.AWAKE,
        },
      });
    }
  }),
});
