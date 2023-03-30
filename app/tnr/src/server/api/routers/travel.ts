import { z } from "zod";
import { type PrismaClient } from "@prisma/client";
import { UserStatus } from "@prisma/client";

import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { calcGlobalTravelTime } from "../../../libs/travel/controls";
import { calcIsInVillage } from "../../../libs/travel/controls";
import { isAtEdge } from "../../../libs/travel/controls";
import { type GlobalMapData } from "../../../libs/travel/map";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { secondsFromNow } from "../../../utils/time";
import * as map from "../../../../public/map/hexasphere.json";

export const travelRouter = createTRPCRouter({
  // Initiate travel on the globe
  startGlobalMove: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const userData = await fetchUser(ctx.prisma, ctx.session.user.id);
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
      return await ctx.prisma.userData.update({
        where: { userId: ctx.session.user.id },
        data: {
          sector: input.sector,
          status: UserStatus.TRAVEL,
          travelFinishAt: endTime,
        },
      });
    }),
  // Finish travel on the globe
  finishGlobalMove: protectedProcedure.mutation(async ({ ctx }) => {
    const userData = await fetchUser(ctx.prisma, ctx.session.user.id);
    if (userData.status !== UserStatus.TRAVEL) {
      throw serverError(
        "FORBIDDEN",
        `Cannot finish travel because your status is: ${userData.status.toLowerCase()}`
      );
    }
    return await ctx.prisma.userData.update({
      where: { userId: ctx.session.user.id },
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
      const { longitude, latitude } = input;
      const userData = await fetchUser(ctx.prisma, ctx.session.user.id);
      if (userData.status !== UserStatus.AWAKE) {
        throw serverError(
          "FORBIDDEN",
          `Cannot move because your status is: ${userData.status.toLowerCase()}`
        );
      }
      const distance = Math.max(
        Math.abs(userData.longitude - longitude),
        Math.abs(userData.latitude - latitude)
      );
      const output = { ...input, refetchUser: false };
      if (distance === 0) {
        return output;
      } else if (distance === 1) {
        // Get new location
        let location = "";
        const village = await ctx.prisma.village.findUnique({
          where: { sector: userData.sector },
        });
        if (village && calcIsInVillage({ x: longitude, y: latitude })) {
          location = `${village.name} Village`;
        }
        if (location !== userData.location) output.refetchUser = true;
        // Update user
        await ctx.prisma.userData.update({
          where: { userId: ctx.session.user.id },
          data: { longitude, latitude, location },
        });
        return output;
      } else {
        throw serverError("CONFLICT", "Can not move more than one square");
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
      longitude: true,
      latitude: true,
      location: true,
      sector: true,
      status: true,
    },
  });
  return userData;
};
