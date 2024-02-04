import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { serverError, baseServerResponse } from "@/server/api/trpc";
import { eq, or, and, gt } from "drizzle-orm";
import { CHALLENGE_EXPIRY_SECONDS } from "@/libs/combat/constants";
import { secondsFromNow } from "@/utils/time";
import { userChallenge } from "@/drizzle/schema";
import { getServerPusher } from "@/libs/pusher";
import { fetchUser } from "@/routers/profile";
import { initiateBattle, determineArenaBackground } from "@/routers/combat";
import type { ChallengeState } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";

const pusher = getServerPusher();

export const sparringRouter = createTRPCRouter({
  getUserChallenges: protectedProcedure.query(async ({ ctx }) => {
    const challenges = await ctx.drizzle.query.userChallenge.findMany({
      where: and(
        or(
          eq(userChallenge.challengerId, ctx.userId),
          eq(userChallenge.challengedId, ctx.userId),
        ),
        gt(userChallenge.createdAt, secondsFromNow(-CHALLENGE_EXPIRY_SECONDS * 2)),
      ),
      with: {
        challenger: {
          columns: { username: true, level: true, rank: true },
        },
        challenged: {
          columns: { username: true, level: true, rank: true },
        },
      },
    });
    return challenges;
  }),
  createChallenge: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const recentChallenges = await ctx.drizzle.query.userChallenge.findMany({
        where: and(
          eq(userChallenge.challengerId, ctx.userId),
          gt(userChallenge.createdAt, secondsFromNow(-10)),
        ),
      });
      // Guard
      if (recentChallenges.length > 0) {
        throw serverError("FORBIDDEN", "Max 1 challenge per 10 seconds");
      }
      // Mutate
      await ctx.drizzle.insert(userChallenge).values({
        id: nanoid(),
        challengerId: ctx.userId,
        challengedId: input.targetId,
        status: "PENDING",
      });
      void pusher.trigger(input.targetId, "event", { type: "challengeCreated" });
      return { success: true, message: "Challenge created" };
    }),
  acceptChallenge: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [challenge, user] = await Promise.all([
        fetchChallenge(ctx.drizzle, input.challengeId),
        fetchUser(ctx.drizzle, ctx.userId),
      ]);
      // Guards
      if (challenge.challengedId !== ctx.userId) {
        throw serverError("FORBIDDEN", "Not your challenge to accept");
      }
      if (challenge.status !== "PENDING") {
        throw serverError("FORBIDDEN", "Challenge not pending");
      }
      // Mutate
      const result = await initiateBattle(
        {
          sector: user.sector,
          userId: challenge.challengedId,
          targetId: challenge.challengerId,
          client: ctx.drizzle,
        },
        "SPARRING",
        determineArenaBackground("Unknown"),
      );
      if (result.success) {
        await updateChallengeState(ctx.drizzle, input.challengeId, "ACCEPTED");
        void pusher.trigger(challenge.challengerId, "event", {
          type: "challengeAccepted",
        });
      }
      return result;
    }),
  rejectChallenge: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const challenge = await fetchChallenge(ctx.drizzle, input.challengeId);
      if (challenge.challengedId !== ctx.userId) {
        throw serverError("FORBIDDEN", "You can only reject challenge for yourself");
      }
      if (challenge.status !== "PENDING") {
        throw serverError("FORBIDDEN", "You can only reject pending challenges");
      }
      void pusher.trigger(challenge.challengerId, "event", {
        type: "challengeRejected",
      });
      return await updateChallengeState(ctx.drizzle, input.challengeId, "REJECTED");
    }),
  cancelChallenge: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const challenge = await fetchChallenge(ctx.drizzle, input.challengeId);
      if (challenge.challengerId !== ctx.userId) {
        throw serverError("FORBIDDEN", "You can only cancel challenges created by you");
      }
      if (challenge.status !== "PENDING") {
        throw serverError("FORBIDDEN", "You can only cancel pending challenges");
      }
      return await updateChallengeState(ctx.drizzle, input.challengeId, "CANCELLED");
    }),
});

export const fetchChallenge = async (client: DrizzleClient, challengeId: string) => {
  const result = await client.query.userChallenge.findFirst({
    where: eq(userChallenge.id, challengeId),
  });
  if (!result) throw serverError("NOT_FOUND", "Challenge not found");
  return result;
};

export const updateChallengeState = async (
  client: DrizzleClient,
  challengeId: string,
  status: ChallengeState,
) => {
  await client
    .update(userChallenge)
    .set({ status })
    .where(eq(userChallenge.id, challengeId));
  return { success: true, message: "Challenge state updated" };
};
