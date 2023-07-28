import { z } from "zod";
import { eq, gte, sql, and, or } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import { calcGlobalTravelTime } from "../../../libs/travel/controls";
import { calcIsInVillage } from "../../../libs/travel/controls";
import { isAtEdge, maxDistance } from "../../../libs/travel/controls";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { secondsFromNow } from "../../../utils/time";
import { getServerPusher } from "../../../libs/pusher";
import { userData } from "../../../../drizzle/schema";
import { fetchUser } from "./profile";
import * as map from "../../../../public/map/hexasphere.json";
import type { inferRouterOutputs } from "@trpc/server";
import type { GlobalMapData } from "../../../libs/travel/types";

// const redis = Redis.fromEnv();

export const travelRouter = createTRPCRouter({
  // Get users within a given sector
  getSectorData: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.sector !== input.sector) {
        throw serverError("FORBIDDEN", `You are not in sector ${input.sector}`);
      }
      return await ctx.drizzle.query.userData.findMany({
        columns: {
          userId: true,
          username: true,
          longitude: true,
          latitude: true,
          location: true,
          curHealth: true,
          maxHealth: true,
          sector: true,
          avatar: true,
          level: true,
          immunityUntil: true,
          updatedAt: true,
        },
        where: and(
          eq(userData.sector, input.sector),
          eq(userData.status, "AWAKE"),
          or(
            gte(userData.updatedAt, secondsFromNow(-300)),
            eq(userData.userId, ctx.userId)
          )
        ),
      });
    }),
  // Initiate travel on the globe
  startGlobalMove: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!isAtEdge({ x: user.longitude, y: user.latitude })) {
        throw serverError(
          "FORBIDDEN",
          `Cannot travel because you are not at the edge of a sector`
        );
      }
      if (user.status !== "AWAKE") {
        throw serverError(
          "FORBIDDEN",
          `Cannot travel because your status is: ${user.status.toLowerCase()}`
        );
      }
      const travelTime = calcGlobalTravelTime(
        user.sector,
        input.sector,
        map as unknown as GlobalMapData
      );
      const endTime = secondsFromNow(travelTime);
      const result = await ctx.drizzle
        .update(userData)
        .set({
          sector: input.sector,
          status: "TRAVEL",
          travelFinishAt: endTime,
        })
        .where(and(eq(userData.userId, ctx.userId), eq(userData.status, "AWAKE")));
      if (result.rowsAffected === 1) {
        user.sector = input.sector;
        user.status = "TRAVEL";
        user.travelFinishAt = endTime;
        const pusher = getServerPusher();
        void pusher.trigger(user.sector.toString(), "event", user);
        return user;
      } else {
        const userData = await fetchUser(ctx.drizzle, ctx.userId);
        if (userData.status !== "AWAKE") {
          throw serverError("FORBIDDEN", `Status is: ${userData.status.toLowerCase()}`);
        } else {
          throw serverError("FORBIDDEN", "Failed to start travel");
        }
      }
    }),
  // Finish travel on the globe
  finishGlobalMove: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (user.status !== "TRAVEL") {
      throw serverError(
        "FORBIDDEN",
        `Cannot finish travel because your status is: ${user.status.toLowerCase()}`
      );
    }
    user.status = "AWAKE";
    user.travelFinishAt = null;
    const pusher = getServerPusher();
    void pusher.trigger(userData.sector.toString(), "event", user);
    await ctx.drizzle
      .update(userData)
      .set({ status: "AWAKE", travelFinishAt: null })
      .where(and(eq(userData.userId, ctx.userId), eq(userData.status, "TRAVEL")));
    return user;
  }),
  // Move user to new local location
  moveInSector: protectedProcedure
    .input(
      z.object({
        longitude: z
          .number()
          .int()
          .min(0)
          .max(SECTOR_WIDTH - 1),
        latitude: z
          .number()
          .int()
          .min(0)
          .max(SECTOR_HEIGHT - 1),
        sector: z.number().int(),
        level: z.number().int(),
        avatar: z.string().url(),
      })
    )
    .output(
      baseServerResponse.merge(
        z.object({
          data: z
            .object({
              location: z.string(),
              userId: z.string(),
              avatar: z.string(),
              sector: z.number(),
              longitude: z.number(),
              latitude: z.number(),
            })
            .optional(),
        })
      )
    )
    .mutation(async ({ input, ctx }) => {
      const { longitude, latitude, sector } = input;
      const isVillage = calcIsInVillage({ x: longitude, y: latitude });
      const location = isVillage ? "Village" : "";
      const result = await ctx.drizzle
        .update(userData)
        .set({
          longitude,
          latitude,
          location,
          updatedAt: sql`Now()`,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            eq(userData.status, "AWAKE"),
            eq(userData.sector, sector),
            sql`ABS(longitude - ${longitude}) <= 1`,
            sql`ABS(latitude - ${latitude}) <= 1`
          )
        );
      if (result.rowsAffected === 1) {
        const output = { ...input, location, userId: ctx.userId };
        const pusher = getServerPusher();
        void pusher.trigger(input.sector.toString(), "event", output);
        return { success: true, message: "OK", data: output };
      } else {
        const userData = await fetchUser(ctx.drizzle, ctx.userId);
        if (userData.status !== "AWAKE") {
          return errorResponse(`Status is: ${userData.status.toLowerCase()}`);
        }
        if (maxDistance(userData, { x: longitude, y: latitude }) > 1) {
          return errorResponse(`Cannot move more than one square at a time`);
        }
        return errorResponse(`Unknown error while moving`);
      }
    }),
});

type RouterOutput = inferRouterOutputs<typeof travelRouter>;
export type SectorUsers = RouterOutput["getSectorData"];
