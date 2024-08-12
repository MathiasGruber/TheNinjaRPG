import { z } from "zod";
import { eq, sql, gt, and, isNull, isNotNull } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import { trainingLog, userData } from "@/drizzle/schema";
import { getNewTrackers } from "@/libs/quest";
import { energyPerSecond } from "@/libs/train";
import { trainingMultiplier } from "@/libs/train";
import { trainEfficiency } from "@/libs/train";
import { calcIsInVillage } from "@/libs/travel/controls";
import { UserStatNames } from "@/drizzle/constants";
import { TrainingSpeeds } from "@/drizzle/constants";
import { getGameSettingBoost } from "@/libs/gamesettings";
import { structureBoost } from "@/utils/village";
import { fetchUpdatedUser } from "@/routers/profile";
import { MAX_DAILY_TRAININGS } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";

export const trainRouter = createTRPCRouter({
  // Start training of a specific attribute
  startTraining: protectedProcedure
    .input(z.object({ stat: z.enum(UserStatNames) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [updatedUser, trainCount] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
          userIp: ctx.userIp,
          forceRegen: true,
        }),
        getLatestTrainingCount(ctx.drizzle, ctx.userId),
      ]);
      const { user } = updatedUser;
      // Derived
      if (!user) throw serverError("NOT_FOUND", "User not found");
      const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
      // Guard
      if (user.status !== "AWAKE") return errorResponse("Must be awake to train");
      if (!user.isOutlaw) {
        if (!inVillage) return errorResponse("Must be in your own village");
        if (user.sector !== user.village?.sector) return errorResponse("Wrong sector");
      }
      if (user.trainingSpeed !== "8hrs" && user.isBanned) {
        return errorResponse("Only 8hrs training interval allowed when banned");
      }
      if (trainCount > MAX_DAILY_TRAININGS) {
        return errorResponse(
          `Training more than ${MAX_DAILY_TRAININGS} times within 24 hours not allowed`,
        );
      }
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingStartedAt: new Date(), currentlyTraining: input.stat })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            isNull(userData.currentlyTraining),
            eq(userData.status, "AWAKE"),
          ),
        );
      if (result.rowsAffected === 0) {
        return errorResponse("You are already training");
      } else {
        return { success: true, message: `Started training` };
      }
    }),
  // Stop training
  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Query
      const { user, settings } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        forceRegen: true,
      });
      // Guard
      if (!user) throw serverError("NOT_FOUND", "User not found");
      if (user.status !== "AWAKE") return errorResponse("Must be awake");
      if (!user.trainingStartedAt) return errorResponse("Not currently training");
      if (!user.currentlyTraining) return errorResponse("Not currently training");
      // Derived training gain
      const trainSetting = getGameSettingBoost("trainingGainMultiplier", settings);
      const gameFactor = trainSetting?.value || 1;
      const boost = structureBoost("trainBoostPerLvl", user.village?.structures);
      const clanBoost = user?.clan?.trainingBoost || 0;
      const factor = gameFactor * (1 + boost / 100 + clanBoost / 100);
      const seconds = (Date.now() - user.trainingStartedAt.getTime()) / 1000;
      const minutes = seconds / 60;
      const energySpent = Math.min(
        Math.floor(energyPerSecond(user.trainingSpeed) * seconds),
        100,
      );
      const trainingAmount =
        factor * energySpent * trainEfficiency(user) * trainingMultiplier(user);
      // Mutate
      const { trackers } = getNewTrackers(user, [
        { task: "stats_trained", increment: trainingAmount },
        { task: "minutes_training", increment: minutes },
      ]);
      user.questData = trackers;
      const [result] = await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({
            trainingStartedAt: null,
            currentlyTraining: null,
            experience: sql`experience + ${trainingAmount}`,
            strength:
              user.currentlyTraining === "strength"
                ? sql`strength + ${trainingAmount}`
                : sql`strength`,
            intelligence:
              user.currentlyTraining === "intelligence"
                ? sql`intelligence + ${trainingAmount}`
                : sql`intelligence`,
            willpower:
              user.currentlyTraining === "willpower"
                ? sql`willpower + ${trainingAmount}`
                : sql`willpower`,
            speed:
              user.currentlyTraining === "speed"
                ? sql`speed + ${trainingAmount}`
                : sql`speed`,
            ninjutsuOffence:
              user.currentlyTraining === "ninjutsuOffence"
                ? sql`ninjutsuOffence + ${trainingAmount}`
                : sql`ninjutsuOffence`,
            ninjutsuDefence:
              user.currentlyTraining === "ninjutsuDefence"
                ? sql`ninjutsuDefence + ${trainingAmount}`
                : sql`ninjutsuDefence`,
            genjutsuOffence:
              user.currentlyTraining === "genjutsuOffence"
                ? sql`genjutsuOffence + ${trainingAmount}`
                : sql`genjutsuOffence`,
            genjutsuDefence:
              user.currentlyTraining === "genjutsuDefence"
                ? sql`genjutsuDefence + ${trainingAmount}`
                : sql`genjutsuDefence`,
            taijutsuOffence:
              user.currentlyTraining === "taijutsuOffence"
                ? sql`taijutsuOffence + ${trainingAmount}`
                : sql`taijutsuOffence`,
            taijutsuDefence:
              user.currentlyTraining === "taijutsuDefence"
                ? sql`taijutsuDefence + ${trainingAmount}`
                : sql`taijutsuDefence`,
            bukijutsuDefence:
              user.currentlyTraining === "bukijutsuDefence"
                ? sql`bukijutsuDefence + ${trainingAmount}`
                : sql`bukijutsuDefence`,
            bukijutsuOffence:
              user.currentlyTraining === "bukijutsuOffence"
                ? sql`bukijutsuOffence + ${trainingAmount}`
                : sql`bukijutsuOffence`,
            questData: user.questData,
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              isNotNull(userData.currentlyTraining),
              eq(userData.status, "AWAKE"),
            ),
          ),
        ctx.drizzle.insert(trainingLog).values({
          userId: ctx.userId,
          amount: trainingAmount,
          stat: user.currentlyTraining,
          speed: user.trainingSpeed,
          trainingFinishedAt: new Date(),
        }),
      ]);
      if (result.rowsAffected === 0) {
        return { success: false, message: "You are not training" };
      } else {
        return {
          success: true,
          message: `You gained ${trainingAmount} ${user.currentlyTraining}`,
        };
      }
    }),
  // Update user training speed
  updateTrainingSpeed: protectedProcedure
    .input(z.object({ speed: z.enum(TrainingSpeeds) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.currentlyTraining) {
        return {
          success: false,
          message: "Cannot change training speed while training",
        };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingSpeed: input.speed })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        return { success: true, message: "Training speed updated" };
      }
    }),
  getLatestTrainingCount: protectedProcedure
    .output(z.object({ count: z.number() }))
    .query(async ({ ctx }) => {
      return { count: await getLatestTrainingCount(ctx.drizzle, ctx.userId) };
    }),
  getTrainingLog: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.trainingLog.findMany({
        where: and(
          eq(trainingLog.userId, input.userId),
          gt(trainingLog.trainingFinishedAt, sql`NOW() - INTERVAL 1 DAY`),
        ),
      });
    }),
});

/**
 * Retrieves the count of the latest training logs for a specific user.
 *
 * @param client - The DrizzleClient instance used to execute the query.
 * @param userId - The ID of the user for whom to retrieve the training count.
 * @returns The count of the latest training logs for the specified user.
 */
export const getLatestTrainingCount = async (client: DrizzleClient, userId: string) => {
  const result = await client
    .select({
      count: sql<number>`COUNT(*)`.mapWith(Number),
    })
    .from(trainingLog)
    .where(
      and(
        eq(trainingLog.userId, userId),
        gt(trainingLog.trainingFinishedAt, sql`NOW() - INTERVAL 1 DAY`),
      ),
    );

  return result?.[0]?.count || 0;
};
