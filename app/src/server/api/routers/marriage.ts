import { userAssociation } from "@/drizzle/schema";
import { z } from "zod";
import type { inferRouterOutputs } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { errorResponse, baseServerResponse, publicProcedure } from "@/server/api/trpc";
import { getServerPusher } from "@/libs/pusher";
import { fetchUser } from "@/routers/profile";
import {
  fetchRequest,
  fetchRequests,
  insertRequest,
  updateRequestState,
} from "@/routers/sparring";
import type { DrizzleClient } from "@/server/db";
import type { UserAssociation } from "@/drizzle/constants";
import { nanoid } from "nanoid";
import { and, eq, or } from "drizzle-orm";
const pusher = getServerPusher();

export const marriageRouter = createTRPCRouter({
  createRequest: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, targetUser, userAssociations] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
        fetchAssociations(ctx.drizzle, ctx.userId, "MARRIAGE"),
      ]);
      // Guards
      if (
        userAssociations.length > 0 &&
        userAssociations.filter(
          (x) =>
            x.userOne.userId === targetUser.userId ||
            x.userTwo.userId === targetUser.userId,
        ).length > 0
      )
        return errorResponse("You are already married to this user");
      // Mutate
      await insertRequest(ctx.drizzle, user.userId, targetUser.userId, "MARRIAGE");
      void pusher.trigger(targetUser.userId, "event", { type: "marriage" });
      // Create
      return { success: true, message: "You have proposed!" };
    }),
  getRequests: protectedProcedure.query(async ({ ctx }) => {
    return await fetchRequests(ctx.drizzle, ["MARRIAGE"], 3600 * 12, ctx.userId);
  }),
  rejectRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "MARRIAGE");
      if (request.receiverId !== ctx.userId) {
        return errorResponse("You can only reject requests for yourself");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only reject pending requests");
      }
      void pusher.trigger(request.senderId, "event", { type: "MARRIAGE" });
      await updateRequestState(ctx.drizzle, input.id, "REJECTED", "MARRIAGE");
      return { success: true, message: "Proposal Rejected" };
    }),
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const request = await fetchRequest(ctx.drizzle, input.id, "MARRIAGE");
      if (request.senderId !== ctx.userId) {
        return errorResponse("You can only cancel requests created by you");
      }
      if (request.status !== "PENDING") {
        return errorResponse("You can only cancel pending requests");
      }
      void pusher.trigger(request.receiverId, "event", { type: "MARRIAGE" });
      await updateRequestState(ctx.drizzle, input.id, "CANCELLED", "MARRIAGE");
      return { success: true, message: "Proposal cancelled" };
    }),
  acceptRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const request = await fetchRequest(ctx.drizzle, input.id, "MARRIAGE");
      // Secondary fetches
      const [sender, receiver, senderAssociations, receiverAssociations] =
        await Promise.all([
          fetchUser(ctx.drizzle, request.senderId),
          fetchUser(ctx.drizzle, request.receiverId),
          fetchAssociations(ctx.drizzle, request.senderId, "MARRIAGE"),
          fetchAssociations(ctx.drizzle, request.receiverId, "MARRIAGE"),
        ]);
      // Guards
      if (ctx.userId !== request.receiverId) return errorResponse("Not your request");
      if (sender.marriageSlots <= senderAssociations.length)
        return errorResponse("Sender does not have enough marriage slots");
      if (receiver.marriageSlots <= receiverAssociations.length)
        return errorResponse("Receiver does not have enough marriage slots");
      if (
        senderAssociations.length > 0 &&
        senderAssociations.filter(
          (x) => x.userOne.userId === ctx.userId || x.userTwo.userId === ctx.userId,
        ).length > 0
      )
        return errorResponse("You are already married to this user");
      // Mutate
      await Promise.all([
        updateRequestState(ctx.drizzle, input.id, "ACCEPTED", "MARRIAGE"),
        insertAssociation(
          ctx.drizzle,
          request.senderId,
          request.receiverId,
          "MARRIAGE",
        ),
      ]);
      void pusher.trigger(request.senderId, "event", { type: "MARRIAGE" });
      // Create
      return { success: true, message: "Proposal Accepted" };
    }),
  getMarriedUsers: publicProcedure
    .input(z.object({ id: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const associations = await fetchAssociations(
        ctx.drizzle,
        input.id ?? ctx?.userId ?? "",
        "MARRIAGE",
      );
      const marriedUsers = associations.map((x) =>
        x.userOne.userId !== (input.id ?? ctx?.userId) ? x.userOne : x.userTwo,
      );

      return marriedUsers;
    }),
  getDivorcedAssociations: protectedProcedure.query(async ({ ctx }) => {
    return await fetchAssociations(ctx.drizzle, ctx.userId, "DIVORCED");
  }),
  divorce: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const associations = await fetchAssociations(ctx.drizzle, ctx.userId, "MARRIAGE");
      const associationToUpdate = associations.find(
        (x) =>
          (x.userOne.userId === input.userId || x.userTwo.userId === input.userId) &&
          x.associationType === "MARRIAGE",
      );

      if (associationToUpdate) {
        await Promise.all([
          await updateAssociation(
            ctx.drizzle,
            associationToUpdate.id,
            "MARRIAGE",
            "DIVORCED",
          ),
        ]);
      } else {
        return errorResponse("Marriage was unable to be found");
      }

      void pusher.trigger(input.userId, "event", { type: "DIVORCED" });
      return { success: true, message: "Divorce finalized" };
    }),
});

export const insertAssociation = async (
  client: DrizzleClient,
  userOne: string,
  userTwo: string,
  associationType: UserAssociation,
) => {
  await client.insert(userAssociation).values({
    id: nanoid(),
    userOne,
    userTwo,
    associationType,
  });
};

export const updateAssociation = async (
  client: DrizzleClient,
  associationId: string,
  currentAssociationType: UserAssociation,
  associationType: UserAssociation,
) => {
  await client
    .update(userAssociation)
    .set({ associationType: associationType })
    .where(
      and(
        eq(userAssociation.id, associationId),
        eq(userAssociation.associationType, currentAssociationType),
      ),
    );
  return { success: true, message: "Challenge state updated" };
};

export const fetchAssociations = async (
  client: DrizzleClient,
  idOne?: string,
  type?: UserAssociation,
) => {
  return await client.query.userAssociation.findMany({
    where: and(
      ...(idOne
        ? [or(eq(userAssociation.userOne, idOne), eq(userAssociation.userTwo, idOne))]
        : []),
      ...(type ? [eq(userAssociation.associationType, type)] : []),
    ),
    with: {
      userOne: { columns: { username: true, userId: true, avatar: true } },
      userTwo: { columns: { username: true, userId: true, avatar: true } },
    },
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
};

export type MarriageRouter = inferRouterOutputs<typeof marriageRouter>;
