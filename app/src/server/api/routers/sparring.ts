import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { serverError, baseServerResponse } from "@/server/api/trpc";
import { eq, or, and, gt } from "drizzle-orm";
import { CHALLENGE_EXPIRY_SECONDS } from "@/libs/combat/constants";
import { secondsFromNow } from "@/utils/time";
import { userChallenge } from "@/drizzle/schema";
import type { ChallengeState } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";

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
    .mutation(async ({ ctx, input }) => {
      // TODO: Create user challenge
    }),
  acceptChallenge: protectedProcedure
    .input(z.object({ challengeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // TODO: Create accept challenge endpoint - start battle
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
