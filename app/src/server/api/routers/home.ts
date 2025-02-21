import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, gte, and, sql } from "drizzle-orm";
import { userData, userHome, homeType, userHomeStorage } from "@/drizzle/schema";
import { fetchUpdatedUser } from "@/routers/profile";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { calcIsInVillage } from "@/libs/travel/controls";
import { fetchSectorVillage } from "@/routers/village";
import type { UserStatus } from "@/drizzle/constants";

export const homeRouter = createTRPCRouter({
  getHome: protectedProcedure
    .output(
      baseServerResponse.extend({
        home: z.object({
          id: z.string(),
          name: z.string(),
          regenBonus: z.number(),
          storageSlots: z.number(),
          cost: z.number(),
        }).optional(),
        availableHomes: z.array(z.object({
          id: z.string(),
          name: z.string(),
          regenBonus: z.number(),
          storageSlots: z.number(),
          cost: z.number(),
        })),
        storage: z.array(z.object({
          id: z.string(),
          slot: z.number(),
          itemId: z.string(),
        })).optional(),
      }),
    )
    .query(async ({ ctx }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) return errorResponse("User not found");

      const userHomeData = await ctx.drizzle.query.userHome.findFirst({
        where: eq(userHome.userId, ctx.userId),
        with: {
          homeType: true,
        },
      });

      const availableHomes = await ctx.drizzle.query.homeType.findMany();

      const storage = userHomeData ? await ctx.drizzle.query.userHomeStorage.findMany({
        where: eq(userHomeStorage.userHomeId, userHomeData.id),
      }) : undefined;

      return {
        success: true,
        message: "Home data retrieved",
        home: userHomeData?.homeType,
        availableHomes,
        storage,
      };
    }),

  upgradeHome: protectedProcedure
    .input(z.object({
      homeTypeId: z.string(),
    }))
    .output(baseServerResponse.extend({
      home: z.object({
        id: z.string(),
        name: z.string(),
        regenBonus: z.number(),
        storageSlots: z.number(),
        cost: z.number(),
      }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) return errorResponse("User not found");

      const selectedHome = await ctx.drizzle.query.homeType.findFirst({
        where: eq(homeType.id, input.homeTypeId),
      });
      if (!selectedHome) return errorResponse("Invalid home type");

      if (user.ryo < selectedHome.cost) {
        return errorResponse("Not enough ryo");
      }

      const currentHome = await ctx.drizzle.query.userHome.findFirst({
        where: eq(userHome.userId, ctx.userId),
        with: {
          homeType: true,
        },
      });

      if (currentHome) {
        if (currentHome.homeType.cost >= selectedHome.cost) {
          return errorResponse("You already have a better or equal home");
        }
      }

      await ctx.drizzle.transaction(async (tx) => {
        await tx.update(userData)
          .set({ ryo: user.ryo - selectedHome.cost })
          .where(eq(userData.userId, ctx.userId));

        if (currentHome) {
          await tx.update(userHome)
            .set({ homeTypeId: selectedHome.id })
            .where(eq(userHome.id, currentHome.id));
        } else {
          await tx.insert(userHome).values({
            id: crypto.randomUUID(),
            userId: ctx.userId,
            homeTypeId: selectedHome.id,
          });
        }
      });

      return {
        success: true,
        message: `Successfully upgraded to ${selectedHome.name}`,
        home: selectedHome,
      };
    }),

  storeItem: protectedProcedure
    .input(z.object({
      itemId: z.string(),
      slot: z.number(),
    }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const userHomeData = await ctx.drizzle.query.userHome.findFirst({
        where: eq(userHome.userId, ctx.userId),
        with: {
          homeType: true,
        },
      });
      if (!userHomeData) return errorResponse("You don't own a home");

      if (input.slot >= userHomeData.homeType.storageSlots) {
        return errorResponse("Invalid storage slot");
      }

      const existingItem = await ctx.drizzle.query.userHomeStorage.findFirst({
        where: and(
          eq(userHomeStorage.userHomeId, userHomeData.id),
          eq(userHomeStorage.slot, input.slot),
        ),
      });
      if (existingItem) return errorResponse("Slot already occupied");

      await ctx.drizzle.insert(userHomeStorage).values({
        id: crypto.randomUUID(),
        userHomeId: userHomeData.id,
        itemId: input.itemId,
        slot: input.slot,
      });

      return {
        success: true,
        message: "Item stored successfully",
      };
    }),

  removeItem: protectedProcedure
    .input(z.object({
      slot: z.number(),
    }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const userHomeData = await ctx.drizzle.query.userHome.findFirst({
        where: eq(userHome.userId, ctx.userId),
      });
      if (!userHomeData) return errorResponse("You don't own a home");

      const result = await ctx.drizzle.delete(userHomeStorage)
        .where(and(
          eq(userHomeStorage.userHomeId, userHomeData.id),
          eq(userHomeStorage.slot, input.slot),
        ));

      if (result.rowsAffected === 0) {
        return errorResponse("No item found in that slot");
      }

      return {
        success: true,
        message: "Item removed successfully",
      };
    }),

  toggleSleep: protectedProcedure
    .output(
      baseServerResponse.extend({
        newStatus: z.enum(["AWAKE", "ASLEEP"]).optional(),
      }),
    )
    .mutation(async ({ ctx }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        forceRegen: true,
      });
      // Guard
      if (!user) return errorResponse("User not found");
      const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
      if (user.isOutlaw && inVillage) {
        const sectorVillage = await fetchSectorVillage(ctx.drizzle, user?.sector ?? -1);
        if (
          sectorVillage &&
          !["OUTLAW", "HIDEOUT", "TOWN"].includes(sectorVillage.type)
        ) {
          return errorResponse("You can't sleep in a village as an outlaw");
        }
      } else if (!user.isOutlaw && !inVillage) {
        return errorResponse("You can't sleep outside a village as a non-outlaw");
      }
      if (user.isBanned) return errorResponse("You are banned");
      if (!["ASLEEP", "AWAKE"].includes(user.status)) {
        return errorResponse("Invalid status, must be awake or asleep");
      }
      if (user.sector !== user.village?.sector && !user.isOutlaw) {
        return errorResponse("Wrong sector");
      }
      // Mutate
      const newStatus: UserStatus = user.status === "ASLEEP" ? "AWAKE" : "ASLEEP";
      if (user.status === "ASLEEP") {
        await ctx.drizzle
          .update(userData)
          .set({ status: "AWAKE" })
          .where(eq(userData.userId, ctx.userId));
      } else {
        const result = await ctx.drizzle
          .update(userData)
          .set({ status: "ASLEEP" })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              eq(userData.status, "AWAKE"),
              gte(userData.curHealth, 0),
            ),
          );
        if (result.rowsAffected === 0) {
          return errorResponse("You can't sleep right now; are you awake and well?");
        }
      }
      // Push status update to sector
      const output = {
        longitude: user.longitude,
        latitude: user.latitude,
        sector: newStatus === "AWAKE" ? user.sector : -1,
        avatar: user.avatar,
        level: user.level,
        villageId: user.villageId,
        battleId: user.battleId,
        username: user.username,
        status: newStatus,
        location: "",
        userId: ctx.userId,
      };
      const pusher = getServerPusher();
      void updateUserOnMap(pusher, user.sector, output);
      // Done
      return {
        success: true,
        message: newStatus === "AWAKE" ? "You have woken up" : "You have gone to sleep",
        newStatus,
      };
    }),
});
