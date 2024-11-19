import { z } from "zod";
import { nanoid } from "nanoid";
import { alias } from "drizzle-orm/mysql-core";
import { getTableColumns } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/api/trpc";
import { baseServerResponse, serverError, errorResponse } from "@/api/trpc";
import { village, villageStructure, userData, notification } from "@/drizzle/schema";
import { villageAlliance, kageDefendedChallenges } from "@/drizzle/schema";
import { eq, sql, gte, and, or } from "drizzle-orm";
import { ramenOptions } from "@/utils/ramen";
import { getRamenHealPercentage, calcRamenCost } from "@/utils/ramen";
import { fetchUser, fetchUpdatedUser } from "@/routers/profile";
import { fetchRequests } from "@/routers/sparring";
import { insertRequest, updateRequestState } from "@/routers/sparring";
import { createConvo } from "@/routers/comments";
import { structureBoost } from "@/utils/village";
import { isKage } from "@/utils/kage";
import { findRelationship } from "@/utils/alliance";
import { canAlly, canWar, canSurrender } from "@/utils/alliance";
import { COST_SWAP_VILLAGE } from "@/drizzle/constants";
import { ALLIANCEHALL_LONG, ALLIANCEHALL_LAT } from "@/libs/travel/constants";
import { UserRequestTypes } from "@/drizzle/constants";
import { WAR_FUNDS_COST } from "@/drizzle/constants";
import { deleteSenseiRequests } from "@/routers/sensei";
import { hasRequiredRank } from "@/libs/train";
import { canSwapVillage } from "@/utils/permissions";
import { VILLAGE_LEAVE_REQUIRED_RANK } from "@/drizzle/constants";
import { VILLAGE_SYNDICATE_ID } from "@/drizzle/constants";
import type { DrizzleClient } from "@/server/db";
import type { AllianceState } from "@/drizzle/constants";
import type { VillageAlliance } from "@/drizzle/schema";

const availRequests = ["SURRENDER", "ALLIANCE"];

export const villageRouter = createTRPCRouter({
  // Get all villages
  getAll: publicProcedure.query(async ({ ctx }) => {
    return await fetchVillages(ctx.drizzle);
  }),
  // Get a specific village & its structures∂
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Fetch in parallel
      const [villageData, defendedChallenges] = await Promise.all([
        fetchVillage(ctx.drizzle, input.id),
        ctx.drizzle.query.kageDefendedChallenges.findMany({
          with: {
            user: {
              columns: {
                username: true,
                userId: true,
                avatar: true,
              },
            },
          },
          where: eq(kageDefendedChallenges.villageId, input.id),
          limit: 8,
          orderBy: (table, { desc }) => [desc(table.createdAt)],
        }),
      ]);

      // Guards
      if (!villageData) throw serverError("NOT_FOUND", "Village not found");

      // Return
      return { villageData, defendedChallenges };
    }),
  // Buying food in ramen shop
  buyFood: protectedProcedure
    .input(z.object({ ramen: z.enum(ramenOptions), villageId: z.string().nullish() }))
    .output(
      baseServerResponse.extend({
        cost: z.number().optional(),
        newHealth: z.number().optional(),
        newStamina: z.number().optional(),
        newChakra: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get structures of current (visiting) village or Sydicate if outlaw
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const village = await fetchSectorVillage(ctx.drizzle, user.sector, user.isOutlaw);
      const structures = await fetchStructures(ctx.drizzle, village?.id);

      // Calculate cost
      const discount = structureBoost("ramenDiscountPerLvl", structures);
      const factor = (100 - discount) / 100;
      const healPercentage = getRamenHealPercentage(input.ramen);
      const cost = calcRamenCost(input.ramen, user) * factor;
      // Guard
      if (user.status !== "AWAKE") return errorResponse("You must be awake");
      if (user.money < cost) return errorResponse("You don't have enough money");
      if (user.isBanned) return errorResponse("You are banned");
      // Mutate with guard
      const newHealth = Math.min(
        user.maxHealth,
        user.curHealth + (user.maxHealth * healPercentage) / 100,
      );
      const newStamina = Math.min(
        user.maxStamina,
        user.curStamina + (user.maxStamina * healPercentage) / 100,
      );
      const newChakra = Math.min(
        user.maxChakra,
        user.curChakra + (user.maxChakra * healPercentage) / 100,
      );
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: user.money - cost,
          curHealth: newHealth,
          curStamina: newStamina,
          curChakra: newChakra,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, cost)));
      if (result.rowsAffected === 0) {
        return errorResponse("Error trying to buy food. Try again.");
      } else {
        return {
          success: true,
          message: "You have bought food",
          cost,
          newHealth,
          newStamina,
          newChakra,
        };
      }
    }),
  leaveVillage: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Queries
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const village = user?.village;

      // Guards
      if (!user) return errorResponse("User does not exist");
      if (user.isOutlaw) return errorResponse("You are already an outlaw");
      if (!village) return errorResponse("Village does not exist");
      if (isKage(user)) return errorResponse("You are the kage");
      if (user.villageId !== village.id) return errorResponse("Not in village");
      if (user.anbuId) return errorResponse("Leave ANBU squad first");
      if (user.clanId) return errorResponse("Leave Clan first");
      if (user.status !== "AWAKE") return errorResponse("You must be awake");
      if (user.isBanned) return errorResponse("Cannot leave while banned");
      if (!hasRequiredRank(user.rank, VILLAGE_LEAVE_REQUIRED_RANK)) {
        return errorResponse("Must be at least chunin to leave village");
      }

      // Update
      await ctx.drizzle
        .update(userData)
        .set({
          villageId: VILLAGE_SYNDICATE_ID,
          villagePrestige: 0,
          isOutlaw: true,
          ...(user.rank === "GENIN" && { senseiId: null }),
          ...(user.rank === "ELDER" && { rank: "JONIN" }),
        })
        .where(and(eq(userData.userId, ctx.userId), eq(userData.status, "AWAKE")));

      return { success: true, message: "You have left the village" };
    }),
  joinVillage: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Queries
      const [updatedUser, village] = await Promise.all([
        fetchUpdatedUser({ client: ctx.drizzle, userId: ctx.userId }),
        fetchVillage(ctx.drizzle, input.villageId),
      ]);
      const user = updatedUser.user;
      // Guards
      if (!user) return errorResponse("User does not exist");
      if (!village) return errorResponse("Village does not exist");
      if (!user.isOutlaw) return errorResponse("You are not an outlaw");
      if (!village.joinable) return errorResponse("Village is not joinable");
      if (user.villageId === village.id) return errorResponse("Already in village");
      if (user.clanId) return errorResponse("Leave faction first");
      if (user.status !== "AWAKE") return errorResponse("You must be awake");
      if (user.isBanned) return errorResponse("Cannot leave while banned");
      if (village.type !== "VILLAGE") return errorResponse("Can only join villages");
      if (!hasRequiredRank(user.rank, VILLAGE_LEAVE_REQUIRED_RANK)) {
        return errorResponse("Must be at least chunin to join village");
      }

      // Update
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({
            villageId: village.id,
            villagePrestige: 0,
            isOutlaw: false,
            joinedVillageAt: new Date(),
            ...(user.rank === "GENIN" && { senseiId: null }),
            ...(user.rank === "ELDER" && { rank: "JONIN" }),
          })
          .where(and(eq(userData.userId, ctx.userId), eq(userData.status, "AWAKE"))),
        // Clear current sensei requests for this user
        deleteSenseiRequests(ctx.drizzle, ctx.userId),
        // Remove the user as sensei for any active students
        ctx.drizzle
          .update(userData)
          .set({ senseiId: null })
          .where(and(eq(userData.senseiId, ctx.userId), eq(userData.rank, "GENIN"))),
      ]);
      return { success: true, message: "You have joined the village" };
    }),
  swapVillage: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Queries
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) return errorResponse("User does not exist");
      const village = await fetchVillage(ctx.drizzle, input.villageId);

      // Derived
      const cost = COST_SWAP_VILLAGE;

      // Guards
      if (!village) return errorResponse("Village does not exist");
      if (isKage(user)) return errorResponse("You are the kage");
      if (user.villageId === village.id) return errorResponse("Already in village");
      if (user.anbuId) return errorResponse("Leave ANBU squad first");
      if (user.clanId) return errorResponse("Leave Clan first");
      if (user.status !== "AWAKE") return errorResponse("You must be awake");
      if (user.isBanned) return errorResponse("Cannot leave while banned");
      if (!canSwapVillage(user.role)) return errorResponse("No permission to do this");
      if (cost > user.reputationPoints) return errorResponse("Need reputation points");
      if (
        village.type === "OUTLAW" &&
        !hasRequiredRank(user.rank, VILLAGE_LEAVE_REQUIRED_RANK)
      ) {
        return errorResponse("Must be at least chunin to join outlaw faction");
      }

      // Update
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({
            villageId: village.id,
            reputationPoints: user.reputationPoints - cost,
            // villagePrestige: 0,
            isOutlaw: village.type === "OUTLAW" ? true : false,
            sector: village.sector,
            longitude: ALLIANCEHALL_LONG,
            latitude: ALLIANCEHALL_LAT,
            ...(user.rank === "GENIN" && { senseiId: null }),
            ...(user.rank === "ELDER" && { rank: "JONIN" }),
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              gte(userData.reputationPoints, cost),
              eq(userData.status, "AWAKE"),
            ),
          ),
        // Clear current sensei requests for this user
        deleteSenseiRequests(ctx.drizzle, ctx.userId),
        // Remove the user as sensei for any active students
        ctx.drizzle
          .update(userData)
          .set({ senseiId: null })
          .where(and(eq(userData.senseiId, ctx.userId), eq(userData.rank, "GENIN"))),
      ]);

      return { success: true, message: "You have swapped villages" };
    }),
  getAlliances: publicProcedure.query(async ({ ctx }) => {
    return await fetchPublicAllianceInformation(ctx.drizzle);
  }),
  createRequest: protectedProcedure
    .input(z.object({ targetId: z.string(), type: z.enum(UserRequestTypes) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, villages, relationships, requests } = await fetchAllienceInfo(
        ctx.drizzle,
        ctx.userId,
      );

      // Derived
      const villageId = user?.villageId;
      const targetId = input.targetId;
      const target = villages.find((v) => v.id === targetId);

      // General guards
      if (!target) return errorResponse("Target village not found");
      if (!user || !villageId) return errorResponse("Not in this village");
      if (!isKage(user)) return errorResponse("You are not kage");
      if (target.type !== "VILLAGE") return errorResponse("Only for villages");
      if (user.village?.type !== "VILLAGE") return errorResponse("Only for villages");
      if (!user.village.allianceSystem) return errorResponse("User Alliance disabled");
      if (!target.allianceSystem) return errorResponse("Target Alliance disabled");

      // Guards
      const request = requests
        .filter((r) => r.status === "PENDING" && r.type === input.type)
        .find(
          (r) =>
            (r.senderId === user.userId && r.receiverId === target.kageId) ||
            (r.senderId === target.kageId && r.receiverId === user.userId),
        );
      if (request) return errorResponse("Already have a pending request");
      if (!availRequests.includes(input.type)) return errorResponse("Bad r-type");

      // Check if alliance is possible
      if (input.type === "ALLIANCE") {
        const check = canAlly(relationships, villages, villageId, targetId);
        if (!check.success) return check;
      } else if (input.type === "SURRENDER") {
        const check = canSurrender(relationships, villageId, targetId);
        if (!check.success) return check;
      }

      // Content for private message
      const title =
        input.type === "ALLIANCE" ? "Alliance request" : "Surrender request";
      const content =
        input.type === "ALLIANCE"
          ? "I would like to form an alliance with your village. Please accept my request in the town hall."
          : "I would like to surrender from the war. Please accept my request in the town hall. ";

      // Mutate
      await Promise.all([
        insertRequest(ctx.drizzle, user.userId, target.kageId, input.type),
        createConvo(ctx.drizzle, ctx.userId, [target.kageId], title, content),
      ]);

      return { success: true, message: "Alliance request sent" };
    }),
  acceptRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, villages, relationships, requests } = await fetchAllienceInfo(
        ctx.drizzle,
        ctx.userId,
      );

      // Derived
      const request = requests.find((r) => r.id === input.id);
      if (!request) return errorResponse("Request not found");
      const senderVillage = villages.find((v) => v.kageId === request?.senderId);
      if (!senderVillage) return errorResponse("Request author no longer kage");
      const senderId = senderVillage?.id;
      const receiverId = user?.villageId;

      // Guards
      if (!user || !receiverId) return errorResponse("Not in this village");
      if (!isKage(user)) return errorResponse("You are not kage");
      if (request.receiverId !== user.userId) return errorResponse("Go away");
      if (request.status !== "PENDING") return errorResponse("Request not pending");
      if (!availRequests.includes(request.type)) return errorResponse("Bad r-type");

      // Check if alliance is possible
      if (request.type === "ALLIANCE") {
        const check = canAlly(relationships, villages, senderId, receiverId);
        if (!check.success) return check;
      } else if (request.type === "SURRENDER") {
        const check = canSurrender(relationships, senderId, receiverId);
        if (!check.success) return check;
      }

      // Update
      const state = request.type === "ALLIANCE" ? "ALLY" : "NEUTRAL";
      await Promise.all([
        upsertAllianceStatus(ctx.drizzle, relationships, senderId, receiverId, state),
        updateRequestState(ctx.drizzle, input.id, "ACCEPTED", request.type),
      ]);

      // Return
      return { success: true, message: "Alliance request accepted" };
    }),
  rejectRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, requests } = await fetchAllienceInfo(ctx.drizzle, ctx.userId);
      // Derived
      const request = requests.find((r) => r.id === input.id);
      // Guards
      if (!user) return errorResponse("Not in this village");
      if (!isKage(user)) return errorResponse("You are not kage");
      if (!request) return errorResponse("Request not found");
      if (request.receiverId !== user.userId) return errorResponse("Go away");
      if (!availRequests.includes(request.type)) return errorResponse("Bad r-type");
      // Update
      await updateRequestState(ctx.drizzle, input.id, "REJECTED", request.type);
      return { success: true, message: "Alliance request rejected" };
    }),
  cancelRequest: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, requests } = await fetchAllienceInfo(ctx.drizzle, ctx.userId);
      // Derived
      const request = requests.find((r) => r.id === input.id);
      // Guards
      if (!user) return errorResponse("Not in this village");
      if (!isKage(user)) return errorResponse("You are not kage");
      if (!request) return errorResponse("Request not found");
      if (request.senderId !== user.userId) return errorResponse("Go away");
      if (!availRequests.includes(request.type)) return errorResponse("Bad r-type");
      // Update
      await updateRequestState(ctx.drizzle, input.id, "CANCELLED", request.type);
      return { success: true, message: "Alliance request rejected" };
    }),
  leaveAlliance: protectedProcedure
    .input(z.object({ allianceId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, relationships } = await fetchAllienceInfo(ctx.drizzle, ctx.userId);
      // Derived
      const alliance = relationships.find((r) => r.id === input.allianceId);
      // Guards
      if (!user) return errorResponse("Could not find user");
      if (!user.villageId) return errorResponse("Not in this village");
      if (!alliance) return errorResponse("Alliance not found");
      if (!isKage(user)) return errorResponse("You are not kage");
      const aId = alliance.villageIdA;
      const bId = alliance.villageIdB;
      if (![aId, bId].includes(user.villageId)) return errorResponse("Not in alliance");
      // Mutate
      await upsertAllianceStatus(ctx.drizzle, relationships, aId, bId, "NEUTRAL");
      // Return
      return { success: true, message: "You have left the alliance" };
    }),
  startWar: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const { user, villages, relationships } = await fetchAllienceInfo(
        ctx.drizzle,
        ctx.userId,
      );

      // Derived
      const villageId = user?.villageId;
      const targetId = input.villageId;
      const userVillage = villages.find((v) => v.id === villageId);
      const target = villages.find((v) => v.id === targetId);

      // General guards
      if (!userVillage) return errorResponse("User village not found");
      if (!target) return errorResponse("Target village not found");
      if (!user || !villageId) return errorResponse("Not in this village");
      if (!isKage(user)) return errorResponse("You are not kage");
      if (target.type !== "VILLAGE") return errorResponse("Only for villages");
      if (userVillage.type !== "VILLAGE") return errorResponse("Only for villages");
      if (!userVillage.allianceSystem) return errorResponse("User Alliance disabled");
      if (!target.allianceSystem) return errorResponse("Target Alliance disabled");

      // Check if war is possible
      const check = canWar(relationships, villages, villageId, targetId);
      if (!check.success) return check;

      // Mutate
      await Promise.all([
        upsertAllianceStatus(ctx.drizzle, relationships, villageId, targetId, "ENEMY"),
        ...check.newEnemies.map((id) =>
          upsertAllianceStatus(ctx.drizzle, relationships, villageId, id, "ENEMY"),
        ),
        ...check.newNeutrals.map((id) =>
          upsertAllianceStatus(ctx.drizzle, relationships, villageId, id, "NEUTRAL"),
        ),
        ctx.drizzle.insert(notification).values({
          userId: ctx.userId,
          content: `${userVillage.name} has declared war on ${target.name}`,
        }),
        ctx.drizzle
          .update(userData)
          .set({ unreadNotifications: sql`unreadNotifications + 1` }),
        ctx.drizzle
          .update(village)
          .set({ tokens: sql`${village.tokens} - ${WAR_FUNDS_COST}` })
          .where(eq(village.id, villageId)),
      ]);
      // Return
      return { success: true, message: "You have declared war" };
    }),
});

/**
 * Upserts the alliance status between two villages.
 * If an alliance relationship already exists between the villages, updates the status.
 * Otherwise, creates a new alliance relationship with the specified status.
 *
 * @param client - The DrizzleClient instance used to interact with the database.
 * @param relationships - The array of existing village alliance relationships.
 * @param villageIdA - The ID of the first village.
 * @param villageIdB - The ID of the second village.
 * @param status - The alliance status to set.
 * @returns A Promise that resolves when the operation is complete.
 */
export const upsertAllianceStatus = async (
  client: DrizzleClient,
  relationships: VillageAlliance[],
  villageIdA: string,
  villageIdB: string,
  status: AllianceState,
) => {
  const alliance = findRelationship(relationships, villageIdA, villageIdB);
  if (alliance) {
    await client
      .update(villageAlliance)
      .set({ status })
      .where(eq(villageAlliance.id, alliance.id));
  } else {
    await client
      .insert(villageAlliance)
      .values({ id: nanoid(), villageIdA, villageIdB, status });
  }
};

/**
 * Fetches alliance information for a given user.
 *
 * @param client - The DrizzleClient instance.
 * @param userId - The ID of the user.
 * @returns An object containing the user, villages, relationships, and requests.
 */
export const fetchAllienceInfo = async (client: DrizzleClient, userId: string) => {
  const [{ user }, villages, relationships, requests] = await Promise.all([
    fetchUpdatedUser({ client, userId }),
    fetchVillages(client),
    fetchAlliances(client),
    fetchRequests(client, ["ALLIANCE", "SURRENDER"], 3600 * 48),
  ]);
  return { user, villages, relationships, requests };
};

/**
 * Fetches the information related to villages, alliances, and requests.
 *
 * @param client - The DrizzleClient instance used for making queries.
 * @returns An object containing the fetched villages, alliances, and requests.
 */
export const fetchPublicAllianceInformation = async (client: DrizzleClient) => {
  const [villages, relationships, requests] = await Promise.all([
    fetchVillages(client),
    fetchAlliances(client),
    fetchRequests(client, ["ALLIANCE", "SURRENDER"], 3600 * 48),
  ]);
  return {
    villages: villages.filter((v) => v.allianceSystem),
    relationships,
    requests,
  };
};

/**
 * Fetches all alliances from the database.
 *
 * @param client - The DrizzleClient instance used to query the database.
 * @returns A promise that resolves to an array of alliance objects.
 */
export const fetchAlliances = async (client: DrizzleClient) => {
  const villageA = alias(village, "villageA");
  const villageB = alias(village, "villageB");
  return await client
    .select(getTableColumns(villageAlliance))
    .from(villageAlliance)
    .innerJoin(villageA, eq(villageA.id, villageAlliance.villageIdA))
    .innerJoin(villageB, eq(villageB.id, villageAlliance.villageIdB))
    .where(and(eq(villageA.allianceSystem, true), eq(villageB.allianceSystem, true)));
};

/**
 * Fetches a village from the database.
 *
 * @param client - The DrizzleClient instance used to query the database.
 * @param villageId - The ID of the village to fetch.
 * @returns A Promise that resolves to the fetched village.
 */
export const fetchVillage = async (client: DrizzleClient, villageId: string) => {
  return await client.query.village.findFirst({
    where: eq(village.id, villageId),
    with: {
      notice: true,
      relationshipA: true,
      relationshipB: true,
      structures: {
        orderBy: (structure, { desc }) => desc(structure.name),
      },
      kage: {
        columns: {
          username: true,
          userId: true,
          avatar: true,
        },
      },
    },
  });
};

/**
 * Fetches a sector village from the database.
 *
 * @param client - The DrizzleClient instance used to query the database.
 * @param sector - The sector number of the village to fetch.
 * @returns A Promise that resolves to the fetched village.
 */
export const fetchSectorVillage = async (
  client: DrizzleClient,
  sector: number,
  isOutlaw = false,
) => {
  const result = await client.query.village.findFirst({
    where: !isOutlaw
      ? eq(village.sector, sector)
      : or(
          and(eq(village.type, "SAFEZONE"), eq(village.sector, sector)),
          eq(village.type, "OUTLAW"),
        ),
    with: {
      notice: true,
      relationshipA: true,
      relationshipB: true,
      structures: {
        orderBy: (structure, { desc }) => desc(structure.name),
      },
      kage: {
        columns: {
          username: true,
          userId: true,
          avatar: true,
        },
      },
    },
  });
  return result || null;
};

/**
 * Fetches villages from the server.
 * @param client - The DrizzleClient instance used for querying the server.
 * @returns A promise that resolves to an array of villages, including the associated kage information.
 */
export const fetchVillages = async (client: DrizzleClient) => {
  return await client.query.village.findMany({
    with: { kage: { columns: { username: true, userId: true, avatar: true } } },
  });
};

/**
 * Fetches structures for a given village.
 * @param client - The DrizzleClient instance used for querying.
 * @param villageId - The ID of the village to fetch structures for.
 * @returns A promise that resolves to an array of structures.
 */
export const fetchStructures = async (
  client: DrizzleClient,
  villageId?: string | null,
) => {
  return await client.query.villageStructure.findMany({
    where: eq(villageStructure.villageId, villageId ?? "syndicate"),
  });
};

/**
 * Fetches a village structure from the database.
 * @param client - The DrizzleClient instance used to query the database.
 * @param structureId - The ID of the structure to fetch.
 * @returns A Promise that resolves to the fetched village structure.
 */
export const fetchStructure = async (client: DrizzleClient, structureId: string) => {
  return await client.query.villageStructure.findFirst({
    where: eq(villageStructure.id, structureId),
  });
};
