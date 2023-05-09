import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client/edge";
import { UserStatus, BattleType } from "@prisma/client/edge";

import { UserEffect, GroundEffect } from "../../../libs/combat/types";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { calcGlobalTravelTime } from "../../../libs/travel/controls";
import { calcIsInVillage } from "../../../libs/travel/controls";
import { isAtEdge, maxDistance } from "../../../libs/travel/controls";
import { type GlobalMapData } from "../../../libs/travel/types";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { secondsFromNow, secondsPassed } from "../../../utils/time";
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
        sector: z.number().int(),
        avatar: z.string().url(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Where the user wishes to go
      const { longitude, latitude, sector } = input;
      // Would this new position be a village?
      const isVillage = calcIsInVillage({ x: longitude, y: latitude });
      const location = isVillage ? "Village" : "";
      // Execute a raw query, which checks that user is not moving longer than one square,
      // is awake, and updates location
      const result: number = await ctx.prisma.$executeRaw`
        UPDATE UserData 
        SET 
          longitude = ${longitude}, latitude = ${latitude}, 
          location = ${location}, updatedAt = Now()
        WHERE 
          userId = ${ctx.userId} AND status = 'AWAKE' AND sector = ${sector} AND
          (ABS(longitude - ${longitude}) <= 1 AND ABS(latitude - ${latitude}) <= 1)`;
      // If successful, return new data, otherwise run queries to figure out why
      if (result === 1) {
        // Output
        const output = { ...input, location, userId: ctx.userId };
        // Push websockets message
        const pusher = getServerPusher();
        void pusher.trigger(input.sector.toString(), "event", output);
        return output;
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
  // Attack another user
  attackUser: protectedProcedure
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
        userId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const battle = await ctx.prisma.$transaction(async (tx) => {
        // Get user & target data, to be inserted into battle
        const users = await tx.userData.findMany({
          include: {
            items: {
              include: {
                item: true,
              },
            },
            jutsus: {
              include: {
                jutsu: true,
              },
            },
            bloodline: true,
            village: true,
          },
          where: {
            OR: [{ userId: ctx.userId }, { userId: input.userId }],
          },
        });
        // Use long/lat fields for position in combat map
        if (users?.[0]) {
          users[0]["longitude"] = 4;
          users[0]["latitude"] = 2;
        } else {
          throw new Error(`Failed to set position of left-hand user`);
        }
        if (users?.[1]) {
          users[1]["longitude"] = 8;
          users[1]["latitude"] = 2;
        } else {
          throw new Error(`Failed to set position of right-hand user`);
        }
        // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
        // Therefore we need to calculate the current pools here, before inserting the user into battle
        users.forEach((user) => {
          const regen =
            (user.bloodline?.regenIncrease
              ? user.regeneration + user.bloodline.regenIncrease
              : user.regeneration) * secondsPassed(user.regenAt);
          user.cur_health = Math.min(user.cur_health + regen, user.max_health);
          user.cur_chakra = Math.min(user.cur_chakra + regen, user.max_chakra);
          user.cur_stamina = Math.min(user.cur_stamina + regen, user.max_stamina);
        });
        // Starting user effects from bloodlines & items
        // TODO: Add effects from items, i.e. equipped armor & accessory
        // TODO: Remove armor & assesory items from inventory before adding to battle
        const userEffects: UserEffect[] = [];
        for (const user of users) {
          if (user.bloodline?.effects) {
            userEffects.push(...(user.bloodline.effects as UserEffect[]));
          }
        }
        // Starting ground effects
        // TODO: Add objects with ground effects
        // Create combat entry
        const battle = await tx.battle.create({
          data: {
            battleType: BattleType.COMBAT,
            background: "forest.webp",
            usersState: users as unknown as Prisma.JsonArray,
            usersEffects: userEffects as Prisma.JsonArray,
            groundEffects: [] as Prisma.JsonArray,
          },
        });
        battle.usersState = [];
        // Update users, but only succeed transaction if none of them already had a battle assigned
        const result: number = await tx.$executeRaw`
          UPDATE UserData 
          SET 
            status = ${UserStatus.BATTLE}, 
            battleId = ${battle.id},
            updatedAt = Now()
          WHERE 
            (userId = ${ctx.userId} OR userId = ${input.userId}) AND 
            status = 'AWAKE' AND 
            sector = ${input.sector} AND 
            longitude = ${input.longitude} AND 
            latitude = ${input.latitude}`;
        if (result !== 2) {
          throw new Error(`Attack failed, did the target move?`);
        }
        // Push websockets message to target
        const pusher = getServerPusher();
        void pusher.trigger(input.userId, "event", { type: "battle" });
        // Return the battle
        return battle;
      });
      return battle;
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
