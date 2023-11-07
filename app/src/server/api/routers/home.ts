import { createTRPCRouter, protectedProcedure } from "../trpc";
import { baseServerResponse, errorResponse } from "../trpc";
import { eq, gte, and } from "drizzle-orm";
import { userData } from "../../../../drizzle/schema";
import { fetchRegeneratedUser } from "./profile";
import { getServerPusher } from "../../../libs/pusher";
import { calcIsInVillage } from "../../../libs/travel/controls";

export const homeRouter = createTRPCRouter({
  toggleSleep: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const user = await fetchRegeneratedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        return errorResponse("User not found");
      }
      if (
        !calcIsInVillage({
          x: user.longitude,
          y: user.latitude,
        })
      ) {
        return errorResponse("You must be in a village to sleep");
      }
      if (user.sector !== user.village?.sector) {
        return errorResponse("You are not in the right sector to sleep");
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
          return errorResponse("You can't sleep right now; are you awake and well?");
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
      return {
        success: true,
        message: newStatus === "AWAKE" ? "You have woken up" : "You have gone to sleep",
      };
    }),
});
