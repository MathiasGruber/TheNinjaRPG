import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, gte, and } from "drizzle-orm";
import { userData } from "@/drizzle/schema";
import { fetchUpdatedUser } from "@/routers/profile";
import { getServerPusher } from "@/libs/pusher";
import { calcIsInVillage } from "@/libs/travel/controls";

export const homeRouter = createTRPCRouter({
  toggleSleep: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        forceRegen: true,
      });
      // Guard
      if (!user) return errorResponse("User not found");
      const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
      if (!inVillage) return errorResponse("You must be in a village to sleep");
      if (user.isBanned) return errorResponse("You are banned");
      if (user.sector !== user.village?.sector) return errorResponse("Wrong sector");
      // Mutate
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
              gte(userData.curHealth, 0),
            ),
          );
        if (result.rowsAffected === 0) {
          return errorResponse("You can't sleep right now; are you awake and well?");
        }
      }
      // Push status update to sector
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
      // Done
      return {
        success: true,
        message: newStatus === "AWAKE" ? "You have woken up" : "You have gone to sleep",
      };
    }),
});
