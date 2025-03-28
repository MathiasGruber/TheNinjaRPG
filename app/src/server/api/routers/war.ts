import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { baseServerResponse, errorResponse } from "../trpc";
import { eq, and, or, gte } from "drizzle-orm";
import { war, village, warAlly, villageStructure } from "@/drizzle/schema";
import { fetchUpdatedUser } from "@/routers/profile";
import { fetchVillages, fetchAlliances } from "@/routers/village";
import { nanoid } from "nanoid";
import type { DrizzleClient } from "@/server/db";
import { handleWarEnd, canJoinWar } from "@/libs/war";
import { sql } from "drizzle-orm";
import {
  insertRequest,
  updateRequestState,
  fetchRequest,
  fetchRequests,
} from "@/routers/sparring";
import { findRelationship } from "@/utils/alliance";
import { isKage } from "@/utils/kage";
import type { RouterOutputs } from "@/app/_trpc/client";

export const warRouter = createTRPCRouter({
  // Get war status including structure HP
  getWarStatus: protectedProcedure
    .input(z.object({ warId: z.string() }))
    .query(async ({ ctx, input }) => {
      const warWithVillageAndStructures = await ctx.drizzle.query.war.findFirst({
        where: eq(war.id, input.warId),
        with: {
          attackerVillage: {
            with: {
              structures: true,
            },
          },
          defenderVillage: {
            with: {
              structures: true,
            },
          },
          warAllies: {
            with: {
              village: true,
            },
          },
        },
      });
      if (!warWithVillageAndStructures) {
        return errorResponse("War not found");
      }
      return warWithVillageAndStructures;
    }),

  // Get active wars for a village
  getActiveWars: protectedProcedure
    .input(z.object({ villageId: z.string() }))
    .query(async ({ ctx, input }) => {
      return fetchActiveWars(ctx.drizzle, input.villageId);
    }),

  // Declare war on another village
  declareWar: protectedProcedure
    .input(z.object({ targetVillageId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [{ user }, activeWars, villages, relationships] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchActiveWars(ctx.drizzle),
        fetchVillages(ctx.drizzle),
        fetchAlliances(ctx.drizzle),
      ]);
      // Derived
      const now = new Date();
      const attackerVillage = villages.find((v) => v.id === user?.village?.id);
      const defenderVillage = villages.find((v) => v.id === input.targetVillageId);
      const relationship = findRelationship(
        relationships,
        attackerVillage?.id || "",
        defenderVillage?.id || "",
      );
      // Guard
      if (!user?.village) {
        return errorResponse("You must be in a village to declare war");
      }
      if (!user?.villageId) {
        return errorResponse("You must be in a village to declare war");
      }
      if (user.userId !== user.village.kageId) {
        return errorResponse("Only the Kage can declare war");
      }
      if (user.village.tokens < 15000) {
        return errorResponse("Your village needs 15,000 tokens to declare war");
      }
      if (!attackerVillage || !defenderVillage) {
        return errorResponse("Village not found");
      }
      if (relationship?.status !== "ENEMY") {
        return errorResponse("You can only declare war on enemy villages");
      }
      if (attackerVillage.type !== "VILLAGE") {
        return errorResponse("You cannot declare war on a non-village");
      }
      if (defenderVillage.type !== "VILLAGE") {
        return errorResponse("You cannot declare war on a non-village");
      }
      if (!attackerVillage.allianceSystem) {
        return errorResponse("Your village is not part of the alliance system");
      }
      if (!defenderVillage.allianceSystem) {
        return errorResponse("Target village is not part of the alliance system");
      }
      if (
        attackerVillage.warExhaustionEndedAt &&
        attackerVillage.warExhaustionEndedAt > now
      ) {
        return errorResponse("Your village is under war exhaustion");
      }
      if (
        defenderVillage.warExhaustionEndedAt &&
        defenderVillage.warExhaustionEndedAt > now
      ) {
        return errorResponse("Target village is under war exhaustion");
      }
      if (attackerVillage.id === defenderVillage.id) {
        return errorResponse("You cannot declare war on your own village");
      }
      if (
        activeWars.find(
          (w) =>
            (w.attackerVillageId === user?.village?.id &&
              w.defenderVillageId === input.targetVillageId) ||
            (w.attackerVillageId === input.targetVillageId &&
              w.defenderVillageId === user?.village?.id),
        )
      ) {
        return errorResponse("You are already at war with this village");
      }

      // Create war and deduct tokens
      const warId = nanoid();
      const [updateResult] = await Promise.all([
        ctx.drizzle
          .update(village)
          .set({ tokens: attackerVillage.tokens - 15000 })
          .where(and(eq(village.id, user.villageId), gte(village.tokens, 15000))),
        ctx.drizzle.insert(war).values({
          id: warId,
          attackerVillageId: user.villageId,
          defenderVillageId: input.targetVillageId,
          status: "ACTIVE",
          type: "VILLAGE_WAR",
          dailyTokenReduction: 1000,
        }),
      ]);
      if (updateResult.rowsAffected === 0) {
        await ctx.drizzle.delete(war).where(eq(war.id, warId));
        return errorResponse("Not enough tokens to declare war");
      }
      return {
        success: true,
        message: "War declared successfully",
      };
    }),

  // Create an offer for factions to join the war
  createAllyOffer: protectedProcedure
    .input(
      z.object({
        warId: z.string(),
        tokenOffer: z.number().int().min(1000),
        targetVillageId: z.string(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [{ user }, activeWar, villages, relationships] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchActiveWar(ctx.drizzle, input.warId),
        fetchVillages(ctx.drizzle),
        fetchAlliances(ctx.drizzle),
      ]);
      // Derived
      const targetVillage = villages.find((v) => v.id === input.targetVillageId);
      // Guard
      if (!user?.village || !user?.villageId) {
        return errorResponse("You must be in a village to create faction offers");
      }
      if (user.userId !== user.village.kageId) {
        return errorResponse("Only the Kage can create faction offers");
      }
      if (!activeWar) {
        return errorResponse("War not found");
      }
      if (
        ![activeWar.attackerVillageId, activeWar.defenderVillageId].includes(
          user.villageId,
        )
      ) {
        return errorResponse("You are not part of this war");
      }
      if (user.village.tokens < input.tokenOffer) {
        return errorResponse("Not enough tokens to create offer");
      }
      if (!targetVillage) {
        return errorResponse("Target village not found");
      }
      if (
        [activeWar.attackerVillageId, activeWar.defenderVillageId].includes(
          input.targetVillageId,
        )
      ) {
        return errorResponse("Cannot create offer for a village already in the war");
      }
      // Final checks
      const { check, message } = canJoinWar(
        activeWar,
        relationships,
        targetVillage,
        user.village,
      );
      if (!check) {
        return errorResponse(message);
      }
      // Insert request
      await insertRequest(
        ctx.drizzle,
        user.userId,
        targetVillage.kageId,
        "WAR_ALLY",
        input.tokenOffer,
        activeWar.id,
      );

      // Return
      return { success: true, message: "Ally offer sent" };
    }),

  rejectAllyOffer: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetches
      const [{ user }, request] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchRequest(ctx.drizzle, input.id, "WAR_ALLY"),
      ]);

      // Guards
      if (!user?.villageId) return errorResponse("Not in a village");
      if (!isKage(user)) return errorResponse("Not kage");
      if (!request) return errorResponse("Request not found");
      if (request.type !== "WAR_ALLY") return errorResponse("Not a war ally request");
      if (request.status !== "PENDING") return errorResponse("Request not pending");
      if (request.receiverId !== user.userId) return errorResponse("Not your request");

      // Update request
      await updateRequestState(ctx.drizzle, request.id, "REJECTED", "WAR_ALLY");

      // Return
      return { success: true, message: "Faction offer rejected" };
    }),

  // Get faction offers for a war
  getAllyOffers: protectedProcedure.query(async ({ ctx }) => {
    return await fetchRequests(ctx.drizzle, ["WAR_ALLY"], 3600 * 12, ctx.userId);
  }),

  // Delist a faction offer
  cancelAllyOffer: protectedProcedure
    .input(z.object({ offerId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [{ user }, offer] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchRequest(ctx.drizzle, input.offerId, "WAR_ALLY"),
      ]);

      // Guard
      if (!offer) {
        return errorResponse("Offer not found");
      }
      if (!user?.village) {
        return errorResponse("You must be in a village to delist offers");
      }
      if (user.userId !== user.village.kageId) {
        return errorResponse("Only the Kage can delist offers");
      }
      if (offer.senderId !== user.userId) {
        return errorResponse("Not your offer to delist");
      }

      // Update request
      await updateRequestState(ctx.drizzle, input.offerId, "CANCELLED", "WAR_ALLY");

      return { success: true, message: "Offer delisted" };
    }),

  // Accept a faction offer
  acceptAllyOffer: protectedProcedure
    .input(z.object({ offerId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [{ user }, activeWars, request, relationships] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchActiveWars(ctx.drizzle),
        fetchRequest(ctx.drizzle, input.offerId, "WAR_ALLY"),
        fetchAlliances(ctx.drizzle),
      ]);
      // Derived
      const warId = request.relatedId;
      const activeWar = activeWars.find(
        (w) =>
          (w.attackerVillage?.kageId === request.senderId ||
            w.defenderVillage?.kageId === request.senderId) &&
          w.id === warId,
      );
      const senderVillage =
        activeWar?.attackerVillage?.kageId === request.senderId
          ? activeWar?.attackerVillage
          : activeWar?.defenderVillage;
      // Guard
      if (!request) {
        return errorResponse("Offer not found");
      }
      if (!senderVillage) {
        return errorResponse("Sender village not found");
      }
      if (!user?.villageId) {
        return errorResponse("You must be in a village or faction to accept offers");
      }
      if (!user?.village) {
        return errorResponse("You must be in a village or faction to accept offers");
      }
      if (user.userId !== user.village.kageId) {
        return errorResponse("Only the leader can accept offers");
      }
      if (!activeWar) {
        return errorResponse("No active war found for the one listing the offer");
      }
      if (request.receiverId !== user.userId) {
        return errorResponse("This offer is not for your village");
      }
      if (request.senderId === user.userId) {
        return errorResponse("Cannot accept your own offer");
      }
      if (activeWar.warAllies.some((f) => f.villageId === user.villageId)) {
        return errorResponse("Already joined this war");
      }
      // Final checks
      const { check, message } = canJoinWar(
        activeWar,
        relationships,
        user.village,
        senderVillage,
      );
      if (!check) return errorResponse(message);
      // Create ally and delete offer
      await Promise.all([
        ctx.drizzle.insert(warAlly).values({
          id: nanoid(),
          warId: activeWar.id,
          villageId: user.villageId,
          supportVillageId: senderVillage.id,
          tokensPaid: request.value || 0,
        }),
        ctx.drizzle
          .update(village)
          .set({ tokens: sql`tokens + ${request.value}` })
          .where(eq(village.id, user.villageId)),
        ctx.drizzle
          .update(village)
          .set({ tokens: sql`tokens - ${request.value}` })
          .where(eq(village.kageId, request.senderId)),
        updateRequestState(ctx.drizzle, input.offerId, "ACCEPTED", "WAR_ALLY"),
      ]);

      return { success: true, message: "Offer accepted and alliance formed" };
    }),

  // Surrender war
  surrender: protectedProcedure
    .input(z.object({ warId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [{ user }, activeWars] = await Promise.all([
        fetchUpdatedUser({
          client: ctx.drizzle,
          userId: ctx.userId,
        }),
        fetchActiveWars(ctx.drizzle),
        fetchVillages(ctx.drizzle),
      ]);
      // Derived
      const activeWar = activeWars.find((w) => w.id === input.warId);
      // Guard
      if (!user?.village) {
        return errorResponse("You must be in a village to surrender");
      }
      if (!user?.villageId) {
        return errorResponse("You must be in a village to surrender");
      }
      if (user.userId !== user.village.kageId) {
        return errorResponse("Only the Kage can surrender");
      }
      if (!activeWar) {
        return errorResponse("Active war was not found");
      }
      if (
        ![activeWar.attackerVillageId, activeWar.defenderVillageId].includes(
          user.villageId,
        )
      ) {
        return errorResponse("You are not part of this war");
      }
      // Mutate
      if (user.villageId === activeWar.attackerVillageId) {
        activeWar.attackerVillage.tokens = 0;
      } else {
        activeWar.defenderVillage.tokens = 0;
      }
      await handleWarEnd(activeWar);
      return { success: true, message: "War surrendered and therefore lost" };
    }),
});

/**
 * Fetch active wars for a village
 * @param client - The database client
 * @param villageId - The ID of the village
 * @returns The active wars
 */
export const fetchActiveWars = async (client: DrizzleClient, villageId?: string) => {
  const activeWars = await client.query.war.findMany({
    where: eq(war.status, "ACTIVE"),
    with: {
      attackerVillage: {
        with: {
          structures: {
            where: eq(villageStructure.route, "/townhall"),
          },
        },
      },
      defenderVillage: {
        with: {
          structures: {
            where: eq(villageStructure.route, "/townhall"),
          },
        },
      },
      warAllies: {
        with: {
          village: true,
        },
      },
    },
  });
  return activeWars.filter((war) => {
    if (villageId) {
      return (
        war.attackerVillageId === villageId ||
        war.defenderVillageId === villageId ||
        war.warAllies.find((f) => f.villageId === villageId)
      );
    }
    return true;
  });
};

/**
 * Fetch an active war
 * @param client - The database client
 * @param warId - The ID of the war
 * @returns The war
 */
export const fetchActiveWar = async (client: DrizzleClient, warId: string) => {
  return await client.query.war.findFirst({
    where: and(eq(war.id, warId), eq(war.status, "ACTIVE")),
    with: {
      attackerVillage: true,
      defenderVillage: true,
      warAllies: {
        with: {
          village: true,
        },
      },
    },
  });
};

export type GetActiveWarsReturnType = NonNullable<
  RouterOutputs["war"]["getActiveWars"]
>;
