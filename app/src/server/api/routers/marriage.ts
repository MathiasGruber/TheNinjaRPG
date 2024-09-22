import { userData } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse } from "@/server/api/trpc";
import { getServerPusher } from "@/libs/pusher";
import { fetchUser, fetchUpdatedUser } from "@/routers/profile";
import {
  fetchRequest,
  fetchRequests,
  insertRequest,
  updateRequestState,
} from "@/routers/sparring";
const pusher = getServerPusher();

export const marriageRouter = createTRPCRouter({
  createRequest: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [updatedUser, targetUser] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchUser(ctx.drizzle, input.userId),
      ]);
      // Derived
      const { user } = updatedUser;
      // Guards
      if (!user) return errorResponse("User not found");
      // Mutate
      await insertRequest(ctx.drizzle, user.userId, targetUser.userId, "MARRIAGE");
      void pusher.trigger(targetUser.userId, "event", { type: "marriage" });
      // Create
      return { success: true, message: "You have proposed!" };
    }),
});
