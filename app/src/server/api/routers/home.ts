import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { eq, gte, and } from "drizzle-orm";
import { userData } from "../../../../drizzle/schema";
import { fetchUser } from "./profile";
import { getServerPusher } from "../../../libs/pusher";
import { calcIsInVillage } from "../../../libs/travel/controls";

export const homeRouter = createTRPCRouter({
  toggleSleep: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (
      !calcIsInVillage({
        x: user.longitude,
        y: user.latitude,
      })
    ) {
      throw serverError("PRECONDITION_FAILED", "You must be in a village to sleep");
    }
    const newStatus = user.status === "ASLEEP" ? "AWAKE" : "ASLEEP";
    if (user.status === "ASLEEP") {
      await ctx.drizzle
        .update(userData)
        .set({ status: "AWAKE" })
        .where(eq(userData.userId, ctx.userId));
    } else {
      const result = await ctx.drizzle
        .update(userData)
        .set({ status: "ASLEEP" })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            eq(userData.status, "AWAKE"),
            gte(userData.curHealth, 0)
          )
        );
      if (result.rowsAffected === 0) {
        throw serverError("PRECONDITION_FAILED", "You can't sleep right now");
      }
    }
    const output = {
      longitude: user.longitude,
      latitude: user.latitude,
      sector: newStatus === "AWAKE" ? user.sector : -1,
      avatar: user.avatar,
      location: "",
      userId: ctx.userId,
    };
    const pusher = getServerPusher();
    void pusher.trigger(user.sector.toString(), "event", output);
    return newStatus;
  }),
});
