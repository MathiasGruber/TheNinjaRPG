import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, gte, and, or, isNull, inArray, sql } from "drizzle-orm";
import {
  createTRPCRouter,
  protectedProcedure,
  ratelimitMiddleware,
  hasUserMiddleware,
} from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import { calcGlobalTravelTime } from "@/libs/travel/controls";
import { calcIsInVillage } from "@/libs/travel/controls";
import { isAtEdge, maxDistance } from "@/libs/travel/controls";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "@/libs/travel/constants";
import { secondsFromNow } from "@/utils/time";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { userData, clan, village, actionLog } from "@/drizzle/schema";
import { fetchUser } from "@/routers/profile";
import { initiateBattle } from "@/routers/combat";
import { fetchSectorVillage } from "@/routers/village";
import { findRelationship } from "@/utils/alliance";
import { structureBoost } from "@/utils/village";
import {
  ROBBING_SUCCESS_CHANCE,
  ROBBING_STOLLEN_AMOUNT,
  ROBBING_VILLAGE_PRESTIGE_GAIN,
  ROBBING_IMMUNITY_DURATION,
} from "@/drizzle/constants";
import * as map from "@/data/hexasphere.json";
import { UserStatuses } from "@/drizzle/constants";
import type { inferRouterOutputs } from "@trpc/server";
import type { GlobalMapData } from "@/libs/travel/types";

// const redis = Redis.fromEnv();

const pusher = getServerPusher();

export const travelRouter = createTRPCRouter({
  // Rob another player
  robPlayer: protectedProcedure
    .use(ratelimitMiddleware)
    .use(hasUserMiddleware)
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
      }),
    )
    .output(
      baseServerResponse.extend({
        battleId: z.string().optional(),
        money: z.number().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Query
      const [user, target, sectorData] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
        ctx.drizzle.query.village.findFirst({
          where: eq(village.sector, input.sector),
        }),
      ]);

      // Guard
      if (!user.isOutlaw) return errorResponse("Only outlaws can rob other players");
      if (user.status !== "AWAKE") return errorResponse("You are not awake");
      if (user.isBanned) return errorResponse("You are banned");
      if (target.isBanned) return errorResponse("Target is banned");
      if (user.clanId === target.clanId)
        return errorResponse("Cannot rob faction members");
      if (target.rank === "STUDENT" || target.rank === "GENIN") {
        return errorResponse("Cannot rob Academy Students or Genins");
      }
      if (sectorData?.pvpDisabled) {
        return errorResponse("Cannot rob players in this zone");
      }
      if (target.robImmunityUntil && target.robImmunityUntil > new Date()) {
        return errorResponse("Target is immune from being robbed");
      }
      if (
        target.sector !== input.sector ||
        target.longitude !== input.longitude ||
        target.latitude !== input.latitude
      ) {
        return errorResponse("Target is not in the specified location");
      }
      if (
        user.sector !== input.sector ||
        user.longitude !== input.longitude ||
        user.latitude !== input.latitude
      ) {
        return errorResponse("You are not in the correct sector");
      }

      // 40% chance to rob successfully
      const success = Math.random() < ROBBING_SUCCESS_CHANCE;
      if (success) {
        // Rob 30% of target's money
        const stolenAmount = Math.floor(target.money * ROBBING_STOLLEN_AMOUNT);

        // Update robber's money and prestige
        const robberUpdate = await ctx.drizzle
          .update(userData)
          .set({
            money: sql`${userData.money} + ${stolenAmount}`,
            villagePrestige: sql`${userData.villagePrestige} + ${ROBBING_VILLAGE_PRESTIGE_GAIN}`,
          })
          .where(eq(userData.userId, ctx.userId));
        if (robberUpdate.rowsAffected === 0) {
          return errorResponse("Failed to update robber's data");
        }

        // Update target's money and set immunity
        const [targetUpdate] = await Promise.all([
          ctx.drizzle
            .update(userData)
            .set({
              money: sql`${userData.money} - ${stolenAmount}`,
              robImmunityUntil: secondsFromNow(ROBBING_IMMUNITY_DURATION),
            })
            .where(eq(userData.userId, input.userId)),
          ...(user.clanId
            ? [
                ctx.drizzle
                  .update(clan)
                  .set({ points: sql`${clan.points} + 1` })
                  .where(eq(clan.id, user.clanId)),
              ]
            : []),
        ]);
        if (targetUpdate.rowsAffected === 0) {
          // Rollback robber update if target update fails
          await ctx.drizzle
            .update(userData)
            .set({
              money: sql`${userData.money} - ${stolenAmount}`,
              villagePrestige: sql`${userData.villagePrestige} - ${ROBBING_VILLAGE_PRESTIGE_GAIN}`,
            })
            .where(eq(userData.userId, ctx.userId));
          return errorResponse("Failed to update target's data");
        }

        // Log the action
        const logInsert = await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: user.userId,
          tableName: "user",
          changes: [`Was robbed for ${stolenAmount} ryo by ${user.username}`],
          relatedId: user.userId,
          relatedMsg: `Was robbed by ${user.username}`,
          relatedImage: user.avatarLight,
        });
        if (logInsert.rowsAffected === 0) {
          // Non-critical error, continue but log it
          console.error("Failed to insert action log for robbery");
        }

        // Notify target (non-critical)
        await pusher.trigger(target.userId, "event", {
          type: "userMessage",
          message: `You've been robbed by ${user.username}`,
        });

        return {
          success: true,
          message: `Successfully robbed ${stolenAmount} money from ${target.username}!`,
          money: user.money + stolenAmount,
        };
      } else {
        // Failed rob attempt - initiate combat
        const battle = await initiateBattle(
          {
            longitude: input.longitude,
            latitude: input.latitude,
            sector: input.sector,
            userIds: [ctx.userId],
            targetIds: [input.userId],
            client: ctx.drizzle,
            asset: "ground",
          },
          "COMBAT",
        );

        if (battle.success) {
          return {
            success: false,
            message: "Rob attempt failed! Prepare for combat!",
            battleId: battle.battleId,
          };
        } else {
          return {
            success: false,
            message: battle.message,
          };
        }
      }
    }),
  // Get users within a given sector
  getSectorData: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .query(async ({ ctx }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const [users, villageData] = await Promise.all([
        ctx.drizzle.query.userData.findMany({
          columns: {
            userId: true,
            username: true,
            longitude: true,
            latitude: true,
            location: true,
            curHealth: true,
            maxHealth: true,
            sector: true,
            status: true,
            avatar: true,
            level: true,
            rank: true,
            isOutlaw: true,
            immunityUntil: true,
            robImmunityUntil: true,
            updatedAt: true,
            villageId: true,
            battleId: true,
          },
          where: and(
            eq(userData.sector, user.sector),
            inArray(userData.status, ["AWAKE", "BATTLE"]),
            or(
              gte(userData.updatedAt, secondsFromNow(-36000)),
              eq(userData.userId, ctx.userId),
            ),
          ),
        }),
        ctx.drizzle.query.village.findFirst({
          where: and(
            eq(village.sector, user.sector),
            inArray(village.type, ["VILLAGE", "SAFEZONE"]),
          ),
          with: { structures: true },
        }),
      ]);
      return { users, village: villageData };
    }),
  // Get village & alliance information for a given sector
  getVillageInSector: protectedProcedure
    .input(z.object({ sector: z.number().int(), isOutlaw: z.boolean().default(false) }))
    .query(async ({ input, ctx }) => {
      return await fetchSectorVillage(ctx.drizzle, input.sector, input.isOutlaw);
    }),
  // Initiate travel on the globe
  startGlobalMove: protectedProcedure
    .input(z.object({ sector: z.number().int() }))
    .output(
      baseServerResponse.extend({
        data: z
          .object({
            sector: z.number(),
            travelFinishAt: z.date(),
            status: z.enum(UserStatuses),
          })
          .optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      let user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!isAtEdge({ x: user.longitude, y: user.latitude })) {
        return { success: false, message: "You are not at the edge of a sector" };
      }
      if (user.status !== "AWAKE") {
        return { success: false, message: `Status is: ${user.status.toLowerCase()}` };
      }
      const travelTime = calcGlobalTravelTime(
        user.sector,
        input.sector,
        map as unknown as GlobalMapData,
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
        void updateUserOnMap(pusher, user.sector, user);
        return {
          success: true,
          message: "OK",
          data: { sector: input.sector, travelFinishAt: endTime, status: "TRAVEL" },
        };
      } else {
        user = await fetchUser(ctx.drizzle, ctx.userId);
        if (user.status !== "AWAKE") {
          return {
            success: false,
            message: `Status is: ${user.status.toLowerCase()}`,
          };
        } else {
          return { success: false, message: "Failed to start travel" };
        }
      }
    }),
  // Finish travel on the globe
  finishGlobalMove: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (!["TRAVEL", "AWAKE"].includes(user.status)) {
        return {
          success: false,
          message: `Cannot finish travel because your status is: ${user.status.toLowerCase()}`,
        };
      }
      user.status = "AWAKE";
      user.travelFinishAt = null;
      void updateUserOnMap(pusher, user.sector, user);
      await ctx.drizzle
        .update(userData)
        .set({ status: "AWAKE", travelFinishAt: null })
        .where(and(eq(userData.userId, ctx.userId), eq(userData.status, "TRAVEL")));
      return { success: true, message: "OK" };
    }),
  // Move user to new local location
  moveInSector: protectedProcedure
    .input(
      z.object({
        curLongitude: z.number().int(),
        curLatitude: z.number().int(),
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
        villageId: z.string().nullish(),
        battleId: z.string().nullish(),
        level: z.number().int(),
        avatar: z.string().url(),
        username: z.string(),
      }),
    )
    .output(
      baseServerResponse.merge(
        z.object({
          data: z
            .object({
              longitude: z.number(),
              latitude: z.number(),
              location: z.string(),
              username: z.string(),
              userId: z.string(),
              avatar: z.string(),
              sector: z.number(),
              battleId: z.string().nullish(),
              villageId: z.string().nullish(),
            })
            .optional(),
        }),
      ),
    )
    .mutation(async ({ input, ctx }) => {
      // Convenience
      const { longitude, latitude, sector, villageId } = input;
      const { curLongitude, curLatitude } = input;
      const userId = ctx.userId;
      const userVillage = villageId ?? "syndicate";
      const isVillage = calcIsInVillage({ x: longitude, y: latitude });
      const location = isVillage ? "Village" : "";
      const travelLength = maxDistance(
        { longitude: curLongitude, latitude: curLatitude },
        { x: longitude, y: latitude },
      );
      // Optimistic update & query simultaneously
      const [result, sectorVillage] = await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ longitude, latitude, location })
          .where(
            and(
              eq(userData.userId, userId),
              eq(userData.status, "AWAKE"),
              eq(userData.sector, sector),
              eq(userData.longitude, curLongitude),
              eq(userData.latitude, curLatitude),
              villageId
                ? eq(userData.villageId, villageId)
                : isNull(userData.villageId),
            ),
          ),
        isVillage
          ? ctx.drizzle.query.village.findFirst({
              with: {
                structures: true,
                relationshipA: true,
                relationshipB: true,
              },
              where: eq(village.sector, sector),
            })
          : undefined,
      ]);
      // Check if move was successful
      if (result.rowsAffected === 1) {
        // Check for encounters / village defence
        if (isVillage && sectorVillage && sectorVillage.id !== userVillage) {
          const relations = [
            ...sectorVillage.relationshipA,
            ...sectorVillage.relationshipB,
          ];
          const relation = findRelationship(relations, userVillage, sectorVillage.id);
          if (relation?.status === "ENEMY") {
            const chance = structureBoost("patrolsPerLvl", sectorVillage.structures);
            if (Math.random() < (travelLength * chance) / 100) {
              const battle = await initiateBattle(
                {
                  longitude: longitude,
                  latitude: latitude,
                  sector: sector,
                  userIds: [ctx.userId],
                  targetIds: ["MJMzOE67Cx2YP3NX8SAbh"],
                  client: ctx.drizzle,
                  scaleTarget: true,
                  asset: "ground",
                },
                "VILLAGE_PROTECTOR",
              );
              if (battle.success) {
                return { success: true, message: "Attacked by village protector" };
              }
            }
          }
        }
        // Final output
        const output = { ...input, location, userId: userId, status: "AWAKE" as const };

        void updateUserOnMap(pusher, input.sector, output);
        return { success: true, message: "OK", data: output };
      } else {
        const user = await fetchUser(ctx.drizzle, userId);
        if (user.status !== "AWAKE") {
          return errorResponse(`Status is: ${user.status.toLowerCase()}`);
        }
        if (user.sector !== sector) {
          return errorResponse("You are not in the correct sector");
        }
        if (user.longitude !== curLongitude || user.latitude !== curLatitude) {
          return errorResponse("You have moved since you started this move");
        }
        throw serverError("BAD_REQUEST", "Unknown error while moving");
      }
    }),
});

type RouterOutput = inferRouterOutputs<typeof travelRouter>;
export type SectorVillage = RouterOutput["getSectorData"]["village"];
