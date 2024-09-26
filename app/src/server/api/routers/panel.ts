import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq } from "drizzle-orm";
import { reportLog, userData } from "@/drizzle/schema";
import { fetchUser } from "@/routers/profile";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import type { UserStatus } from "@/drizzle/constants";
import { z } from "zod";
import { inferRouterOutputs } from "@trpc/server";
import { nanoid } from "nanoid";

export const panelRouter = createTRPCRouter({
  forceAwake: protectedProcedure
    .output(baseServerResponse)
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, targetUser] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
        ctx.drizzle.insert(reportLog).values({
          id: nanoid(),
          staffUserId: ctx.userId,
          action: "FORCED_AWAKE",
          targetUserId: input.userId,
        }),
      ]);
      // Guard
      if (!user) return errorResponse("User not found");
      if (!["MODERATOR", "ADMIN"].includes(user.role))
        return errorResponse("You aren't authorized to perform this action");

      // Mutate
      await ctx.drizzle
        .update(userData)
        .set({ status: "AWAKE" })
        .where(eq(userData.userId, targetUser.userId));

      // Push status update to sector
      const output = {
        longitude: user.longitude,
        latitude: user.latitude,
        sector: user.sector,
        avatar: user.avatar,
        level: user.level,
        villageId: user.villageId,
        battleId: user.battleId,
        username: user.username,
        status: "AWAKE" as UserStatus,
        location: "",
        userId: ctx.userId,
      };
      const pusher = getServerPusher();
      void updateUserOnMap(pusher, user.sector, output);
      // Done
      return {
        success: true,
        message: "You have changed user's state to awake",
      };
    }),
});

export type panelRouter = inferRouterOutputs<typeof panelRouter>;
