import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, gte, and } from "drizzle-orm";
import { userData, userItem } from "@/drizzle/schema";
import { fetchUpdatedUser } from "@/routers/profile";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { calcIsInVillage } from "@/libs/travel/controls";
import { fetchSectorVillage } from "@/routers/village";
import { HomeTypes, HomeTypeDetails } from "@/drizzle/constants";
import type { UserStatus } from "@/drizzle/constants";

export const homeRouter = createTRPCRouter({
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

  getUserHome: protectedProcedure.query(async ({ ctx }) => {
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });

    if (!user) return null;

    return {
      homeType: user.homeType,
      regen: HomeTypeDetails[user.homeType].regen,
      storage: HomeTypeDetails[user.homeType].storage,
      storedItems: user.homeStoredItems,
    };
  }),

  getAvailableUpgrades: protectedProcedure.query(async ({ ctx }) => {
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });

    if (!user) return [];

    const currentHomeIndex = HomeTypes.indexOf(user.homeType);
    const upgrades = [];
    
    // Add upgrades (higher tier homes)
    for (let i = currentHomeIndex + 1; i < HomeTypes.length; i++) {
      const homeType = HomeTypes[i] as HomeType;
      upgrades.push({
        type: homeType,
        ...HomeTypeDetails[homeType],
        isUpgrade: true,
      });
    }

    // Add downgrades (lower tier homes)
    for (let i = currentHomeIndex - 1; i >= 0; i--) {
      const homeType = HomeTypes[i] as HomeType;
      upgrades.push({
        type: homeType,
        ...HomeTypeDetails[homeType],
        isUpgrade: false,
      });
    }

    return upgrades;
  }),

  upgradeHome: protectedProcedure
    .input(z.object({
      homeType: z.enum(HomeTypes),
    }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });

      // Guard
      if (!user) return errorResponse("User not found");
      if (user.isBanned) return errorResponse("You are banned");
      if (user.homeType === input.homeType) return errorResponse("You already own this home type");
      
      const targetHome = HomeTypeDetails[input.homeType];
      const currentHome = HomeTypeDetails[user.homeType];
      
      // Upgrading
      if (HomeTypes.indexOf(input.homeType) > HomeTypes.indexOf(user.homeType)) {
        const cost = targetHome.cost;
        if (user.ryo < cost) return errorResponse("Not enough Ryo to upgrade your home");
        
        await ctx.drizzle.update(userData).set({
          ryo: user.ryo - cost,
          homeType: input.homeType,
        }).where(eq(userData.userId, ctx.userId));
        
        return {
          success: true,
          message: `Successfully upgraded to ${targetHome.name}`,
        };
      } 
      // Downgrading
      else {
        // Check if stored items can fit in the new home
        if (user.homeStoredItems.length > targetHome.storage) {
          return errorResponse(`You need to remove some items from storage first (max ${targetHome.storage})`);
        }
        
        await ctx.drizzle.update(userData).set({
          homeType: input.homeType,
        }).where(eq(userData.userId, ctx.userId));
        
        return {
          success: true,
          message: `Successfully downgraded to ${targetHome.name}`,
        };
      }
    }),

  storeItem: protectedProcedure
    .input(z.object({
      itemId: z.string(),
    }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      
      // Guard
      if (!user) return errorResponse("User not found");
      if (user.homeType === "NONE") return errorResponse("You need a home to store items");
      if (user.homeStoredItems.length >= HomeTypeDetails[user.homeType].storage) {
        return errorResponse("Your home storage is full");
      }
      
      // Verify item exists in inventory and is not equipped
      const userItemResult = await ctx.drizzle.query.userItem.findFirst({
        where: and(
          eq(userItem.userId, ctx.userId),
          eq(userItem.id, input.itemId),
          eq(userItem.equipped, "NONE")
        ),
      });
      
      if (!userItemResult) return errorResponse("Item not found or is equipped");
      
      // Add to storage and remove from inventory
      const updatedStorage = [...user.homeStoredItems, input.itemId];
      
      await ctx.drizzle.update(userData).set({
        homeStoredItems: updatedStorage,
      }).where(eq(userData.userId, ctx.userId));
      
      await ctx.drizzle.update(userItem).set({
        quantity: userItemResult.quantity - 1,
      }).where(eq(userItem.id, input.itemId));
      
      // If quantity becomes 0, delete the item
      if (userItemResult.quantity <= 1) {
        await ctx.drizzle.delete(userItem).where(eq(userItem.id, input.itemId));
      }
      
      return {
        success: true,
        message: "Item stored in your home successfully",
      };
    }),

  retrieveItem: protectedProcedure
    .input(z.object({
      itemId: z.string(),
    }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      
      // Guard
      if (!user) return errorResponse("User not found");
      if (!user.homeStoredItems.includes(input.itemId)) {
        return errorResponse("Item not found in your home storage");
      }
      
      // Remove from storage
      const updatedStorage = user.homeStoredItems.filter(id => id !== input.itemId);
      
      await ctx.drizzle.update(userData).set({
        homeStoredItems: updatedStorage,
      }).where(eq(userData.userId, ctx.userId));
      
      // Check if user already has this item in inventory
      const existingItem = await ctx.drizzle.query.userItem.findFirst({
        where: and(
          eq(userItem.userId, ctx.userId),
          eq(userItem.itemId, input.itemId),
          eq(userItem.equipped, "NONE")
        ),
      });
      
      if (existingItem) {
        // Update quantity
        await ctx.drizzle.update(userItem).set({
          quantity: existingItem.quantity + 1,
        }).where(eq(userItem.id, existingItem.id));
      } else {
        // Add new item to inventory
        const item = await ctx.drizzle.query.item.findFirst({
          where: eq(userItem.id, input.itemId),
        });
        
        if (!item) return errorResponse("Item data not found");
        
        await ctx.drizzle.insert(userItem).values({
          id: input.itemId,
          userId: ctx.userId,
          itemId: input.itemId,
          quantity: 1,
          equipped: "NONE",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      
      return {
        success: true,
        message: "Item retrieved from your home successfully",
      };
    }),
});
