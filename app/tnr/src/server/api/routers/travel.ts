import { z } from "zod";
import { type PrismaClient } from "@prisma/client/edge";
import { UserStatus } from "@prisma/client/edge";

import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { calcGlobalTravelTime } from "../../../libs/travel/controls";
import { calcIsInVillage } from "../../../libs/travel/controls";
import { isAtEdge, maxDistance } from "../../../libs/travel/controls";
import { type GlobalMapData } from "../../../libs/travel/types";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { secondsFromNow } from "../../../utils/time";
import { getServerPusher } from "../../../libs/pusher";
import * as map from "../../../../public/map/hexasphere.json";

export const travelRouter = createTRPCRouter({
  // Get users within a given sector
  getSectorData: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const userData = await fetchUser(ctx.prisma, ctx.userId);
      if (userData.sector !== input.sector) {
        throw serverError("FORBIDDEN", `You are not in sector ${input.sector}`);
      }
      const users = await ctx.prisma.userData.findMany({
        where: {
          sector: input.sector,
          OR: [{ updatedAt: { gt: secondsFromNow(-300) } }, { userId: ctx.userId }],
        },
        select: {
          userId: true,
          username: true,
          longitude: true,
          latitude: true,
          location: true,
          cur_health: true,
          max_health: true,
          sector: true,
          avatar: true,
        },
      });
      return users;
    }),
  // Initiate travel on the globe
  startGlobalMove: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const userData = await fetchUser(ctx.prisma, ctx.userId);
      if (!isAtEdge({ x: userData.longitude, y: userData.latitude })) {
        throw serverError(
          "FORBIDDEN",
          `Cannot travel because you are not at the edge of a sector`
        );
      }
      if (userData.status !== UserStatus.AWAKE) {
        throw serverError(
          "FORBIDDEN",
          `Cannot travel because your status is: ${userData.status.toLowerCase()}`
        );
      }
      const travelTime = calcGlobalTravelTime(
        userData.sector,
        input.sector,
        map as unknown as GlobalMapData
      );
      const endTime = secondsFromNow(travelTime);
      // Update database
      const newUserData = await ctx.prisma.userData.update({
        where: { userId: ctx.userId },
        data: {
          sector: input.sector,
          status: UserStatus.TRAVEL,
          travelFinishAt: endTime,
        },
      });
      // Update over websockets
      const pusher = getServerPusher();
      void pusher.trigger(userData.sector.toString(), "event", newUserData);
      // Return new userdata
      return newUserData;
    }),
  // Finish travel on the globe
  finishGlobalMove: protectedProcedure.mutation(async ({ ctx }) => {
    const userData = await fetchUser(ctx.prisma, ctx.userId);
    if (userData.status !== UserStatus.TRAVEL) {
      throw serverError(
        "FORBIDDEN",
        `Cannot finish travel because your status is: ${userData.status.toLowerCase()}`
      );
    }
    // Update over websockets
    const pusher = getServerPusher();
    void pusher.trigger(userData.sector.toString(), "event", userData);
    // Return new userdata
    return await ctx.prisma.userData.update({
      where: { userId: ctx.userId },
      data: {
        status: UserStatus.AWAKE,
        travelFinishAt: null,
      },
    });
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
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Where the user wishes to go
      const { longitude, latitude } = input;
      // Would this new position be a village?
      const isVillage = calcIsInVillage({ x: longitude, y: latitude });
      const location = isVillage ? "Village" : "";
      // Execute a raw query, which checks that user is not moving longer than one square,
      // is awake, and updates location
      const result: number = await ctx.prisma.$executeRaw`
        UPDATE UserData SET longitude = ${longitude}, latitude = ${latitude}, location = ${location}
        WHERE userId = ${ctx.userId} AND status = 'AWAKE' AND
          (ABS(longitude - ${longitude}) <= 1 AND ABS(latitude - ${latitude}) <= 1)`;
      // If successful, return new data, otherwise run queries to figure out why
      if (result === 1) {
        return { ...input, location };
      } else {
        const userData = await fetchUser(ctx.prisma, ctx.userId);
        // Check user status
        if (userData.status !== UserStatus.AWAKE) {
          throw serverError("FORBIDDEN", `Status is: ${userData.status.toLowerCase()}`);
        }
        // Check distance
        if (maxDistance(userData, { x: longitude, y: latitude }) > 1) {
          throw serverError("FORBIDDEN", `Cannot move more than one square at a time`);
        }
      }
    }),
});

/**
 * Fetches the user data
 */
export const fetchUser = async (client: PrismaClient, id: string) => {
  const userData = await client.userData.findUniqueOrThrow({
    where: { userId: id },
    select: {
      userId: true,
      username: true,
      avatar: true,
      cur_health: true,
      max_health: true,
      longitude: true,
      latitude: true,
      location: true,
      sector: true,
      status: true,
    },
  });
  return userData;
};
