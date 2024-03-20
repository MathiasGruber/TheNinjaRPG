import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, asc, and, or, isNull } from "drizzle-orm";
import { userData, userRequest } from "@/drizzle/schema";
import { getServerPusher } from "@/libs/pusher";
import { fetchUser } from "@/routers/profile";
import {
  fetchRequest,
  fetchRequests,
  insertRequest,
  updateRequestState,
} from "@/routers/sparring";
import type { DrizzleClient } from "@/server/db";

const pusher = getServerPusher();

export const senseiRouter = createTRPCRouter({
  getStudents: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return await fetchStudents(ctx.drizzle, input.userId);
    }),
  getRequests: protectedProcedure.query(async ({ ctx }) => {
    return fetchRequests(ctx.drizzle, ["SENSEI"], 3600 * 24, ctx.userId);
  }),
  createRequest: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, target, recent] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.targetId),
        fetchRequests(ctx.drizzle, ["SENSEI"], 10, ctx.userId),
      ]);
      // Guard
      if (recent.length > 0) {
        return errorResponse("Max 1 sensei request per 10 seconds");
      }
      if (target.villageId !== user.villageId) {
        return errorResponse("Sensei must be from same village");
      }
      if (user.rank === "JONIN" && target.rank !== "GENIN") {
        return errorResponse("Jonin can only teach Genin");
      }
      if (user.rank === "GENIN" && target.rank !== "JONIN") {
        return errorResponse("Genin can only learn from Jonin");
      }
      // Mutate
      await insertRequest(ctx.drizzle, user.userId, target.userId, "SENSEI");
      void pusher.trigger(input.targetId, "event", { type: "sensei" });
      return { success: true, message: "Request created" };
    }),
  rejectRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "SENSEI");
      if (request.receiverId !== ctx.userId) {
        return errorResponse("You can only reject requests for yourself");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only reject pending requests");
      }
      void pusher.trigger(request.senderId, "event", { type: "sensei" });
      return await updateRequestState(ctx.drizzle, input.id, "REJECTED", "SENSEI");
    }),
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "SENSEI");
      if (request.senderId !== ctx.userId) {
        return errorResponse("You can only cancel requests created by you");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only cancel pending requests");
      }
      return await updateRequestState(ctx.drizzle, input.id, "CANCELLED", "SENSEI");
    }),
  acceptRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [request, user] = await Promise.all([
        fetchRequest(ctx.drizzle, input.id, "SENSEI"),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Derived
      const studentId = user.rank === "GENIN" ? user.userId : request.senderId;
      const senseiId = user.rank === "GENIN" ? request.senderId : user.userId;
      const students = await fetchStudents(ctx.drizzle, senseiId);
      const activeStudents = students.filter((s) => s.rank === "GENIN");
      // Guards
      if (request.receiverId !== ctx.userId) {
        return errorResponse("Not your challenge to accept");
      }
      if (request.status !== "PENDING") {
        return errorResponse("Challenge not pending");
      }
      if (user.rank === "GENIN" && user.senseiId) {
        return errorResponse("You already have a sensei");
      }
      if (activeStudents.length > 3) {
        return errorResponse("Jonin can only have 3 active students");
      }
      // Mutate. If not successfull, assume student already has a sensei
      const result = await ctx.drizzle
        .update(userData)
        .set({ senseiId })
        .where(and(eq(userData.userId, studentId), isNull(userData.senseiId)));
      if (result.rowsAffected !== 0) {
        await updateRequestState(ctx.drizzle, input.id, "ACCEPTED", "SENSEI");
        void pusher.trigger(request.senderId, "event", { type: "sensei" });
        return { success: true, message: "Request accepted" };
      }
      return errorResponse("Student already has a sensei");
    }),
});

/**
 * Fetches the students associated with a sensei.
 *
 * @param client - The Drizzle client instance.
 * @param userId - The ID of the sensei.
 * @returns - A promise that resolves when the students are fetched.
 */
export const fetchStudents = async (client: DrizzleClient, userId: string) => {
  return await client.query.userData.findMany({
    where: eq(userData.senseiId, userId),
    orderBy: asc(userData.level),
  });
};

/**
 * Deletes user requests of type "SENSEI" where the senderId or receiverId matches the given userId.
 *
 * @param client - The DrizzleClient instance used to perform the delete operation.
 * @param userId - The ID of the user whose requests should be deleted.
 * @returns A Promise that resolves to the result of the delete operation.
 */
export const deleteSenseiRequests = async (client: DrizzleClient, userId: string) => {
  return await client
    .delete(userRequest)
    .where(
      and(
        eq(userRequest.type, "SENSEI"),
        or(eq(userRequest.senderId, userId), eq(userRequest.receiverId, userId)),
      ),
    );
};
