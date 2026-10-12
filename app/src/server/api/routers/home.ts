import { and, eq, gt, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { UserStatus } from "@/drizzle/constants";
import {
  HomeTypeDetails,
  HomeTypes,
  MAP_WAR_TORN_BATTLEGROUND_SECTOR,
} from "@/drizzle/constants";
import { item, userData, userItem } from "@/drizzle/schema";
import { applyActiveVariant } from "@/libs/combat/util";
import {
  getHomeLayout,
  type HomeFurniture,
  homeLayoutOwnershipError,
} from "@/libs/home";
import {
  getHomeStorageBucket,
  getHomeStorageBucketCapacity,
  getHomeStorageBucketFullMessage,
  getInventoryBucket,
  getInventoryBucketCapacity,
  getInventoryBucketFullMessage,
} from "@/libs/item";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { calcIsInVillage } from "@/libs/travel";
import { fetchUserItems } from "@/routers/item";
import { fetchUpdatedUser } from "@/routers/profile";
import { fetchSectorVillage } from "@/routers/village";
import {
  baseServerResponse,
  createTRPCRouter,
  errorResponse,
  protectedProcedure,
} from "@/server/api/trpc";
import type { DrizzleClient } from "@/server/db";
import { getNextUserSnapshotAt } from "@/server/utils/concurrency";
import {
  homeFurnitureSaveInputSchema,
  homeSleepResponseSchema,
  homeStorageInputSchema,
  homeUpgradeInputSchema,
} from "@/validators/home";

export const homeRouter = createTRPCRouter({
  toggleSleep: protectedProcedure
    .meta({
      mcp: { description: "Toggle between awake and asleep status" },
    })
    .output(homeSleepResponseSchema)
    .mutation(async ({ ctx }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        forceRegen: true,
      });
      // Guard
      if (!user) return errorResponse("User not found");
      // Derived
      const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
      const newStatus: UserStatus = user.status === "ASLEEP" ? "AWAKE" : "ASLEEP";
      // Guards
      if (user.isOutlaw && inVillage) {
        const sectorVillage = await fetchSectorVillage(ctx.drizzle, user?.sector ?? -1);
        if (
          newStatus === "ASLEEP" &&
          sectorVillage &&
          !["OUTLAW", "HIDEOUT", "STRONGHOLD"].includes(sectorVillage.type)
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
      if (newStatus === "ASLEEP" && user.sector === MAP_WAR_TORN_BATTLEGROUND_SECTOR) {
        return errorResponse("You cannot sleep in the war-torn battleground");
      }
      // Mutate
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
        avatarLight: user.avatarLight,
        level: user.level,
        experience: user.experience,
        rank: user.rank,
        villageId: user.villageId,
        battleId: user.battleId,
        username: user.username,
        status: newStatus,
        location: "",
        userId: ctx.userId,
        curHealth: user.curHealth,
        maxHealth: user.maxHealth,
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

  getUserHome: protectedProcedure
    .meta({ mcp: { description: "Get current user home info" } })
    .query(async ({ ctx }) => {
      // Revision and item positions come from one statement, keeping refetched layouts coherent.
      const user = await fetchHomeFurnitureUser(ctx.drizzle, ctx.userId);
      if (!user) return null;
      const furnitureItems = user.items.filter(
        (owned) => owned.item?.itemType === "FURNITURE" && !owned.item.hidden,
      );
      return {
        homeType: user.homeType,
        regen: HomeTypeDetails[user.homeType].regen,
        storage: HomeTypeDetails[user.homeType].storage,
        furniture: furnitureItems.map((owned): HomeFurniture => {
          const content = applyActiveVariant(owned);
          return {
            id: owned.id,
            itemId: owned.itemId,
            name: content.name,
            description: content.description,
            image: content.image,
            width: content.furnitureWidth,
            groundAnchor: content.furnitureGroundAnchor,
            action: content.furnitureAction,
            isFloor: content.furnitureIsFloor,
            quantity: owned.quantity,
          };
        }),
        furnitureRevision: user.homeFurnitureRevision,
        layout: getHomeLayout(furnitureItems),
      };
    }),

  saveFurnitureLayout: protectedProcedure
    .meta({ mcp: { description: "Save furniture placement in your current home" } })
    .input(homeFurnitureSaveInputSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchHomeFurnitureUser(ctx.drizzle, ctx.userId);
      const block = homeFurnitureAccessError(user);
      if (block || !user) return errorResponse(block ?? "User not found");
      if (
        user.homeType !== input.homeType ||
        user.homeFurnitureRevision !== input.revision
      ) {
        return errorResponse("Your home changed. Refresh and try again");
      }
      const ownershipError = homeLayoutOwnershipError(
        input.placements,
        user.items.filter(
          (owned) => owned.item?.itemType === "FURNITURE" && !owned.item.hidden,
        ),
      );
      if (ownershipError) return errorResponse(ownershipError);

      /** Maps placements to owned inventory rows and resets omitted furniture's coordinates. */
      const coordinateCase = (axis: "x" | "y" | "rotation") =>
        input.placements.length
          ? sql`CASE ${userItem.id} ${sql.join(
              input.placements.map(
                (placement) => sql`WHEN ${placement.id} THEN ${placement[axis]}`,
              ),
              sql` `,
            )} ELSE ${axis === "rotation" ? 0 : null} END`
          : sql`${axis === "rotation" ? 0 : null}`;
      // Drizzle's update builder targets one table. A single joined update atomically
      // publishes every placement and its revision without a transaction or partial room.
      // A concurrent sale can only remove a cosmetic placement; this never recreates inventory.
      const result = await ctx.drizzle.execute(sql`
        UPDATE ${userData}
        LEFT JOIN (${userItem} INNER JOIN ${item} ON ${item.id} = ${userItem.itemId})
          ON ${userItem.userId} = ${userData.userId}
          AND ${availableHomeFurnitureItems()}
          AND ${item.itemType} = ${"FURNITURE"} AND ${item.hidden} = ${false}
        SET ${userData.homeFurnitureRevision} = ${userData.homeFurnitureRevision} + 1,
            ${userItem.homeX} = ${coordinateCase("x")},
            ${userItem.homeY} = ${coordinateCase("y")},
            ${userItem.homeRotation} = ${coordinateCase("rotation")}
        WHERE ${homeFurnitureWriteGuard(user, ctx.userId, input.revision)}
      `);
      // MySQL counts changed inventory rows as well as the account revision.
      if (result.rowsAffected === 0) {
        return errorResponse("Your home changed. Refresh and try again");
      }
      return {
        success: true,
        message: "Your furniture layout has been saved",
      };
    }),

  getAvailableUpgrades: protectedProcedure
    .meta({ mcp: { description: "Get available home upgrades" } })
    .query(async ({ ctx }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      // Guard
      if (!user) return [];
      // Derived
      const currentHomeIndex = HomeTypes.indexOf(user.homeType);
      const currentHomeCost = HomeTypeDetails[user.homeType].cost;
      // Return all other home types; upgradeCost is what the user pays (target cost minus current home value)
      const upgrades = HomeTypes.map((homeType, i) => {
        const details = HomeTypeDetails[homeType];
        const isUpgrade = i > currentHomeIndex;
        const upgradeCost = isUpgrade ? Math.max(0, details.cost - currentHomeCost) : 0;
        const downgradeRefund = !isUpgrade
          ? Math.floor((currentHomeCost - details.cost) * 0.75)
          : 0;
        return {
          type: homeType,
          ...details,
          isUpgrade,
          upgradeCost,
          downgradeRefund,
        };
      }).filter((upgrade) => upgrade.type !== user.homeType);
      return upgrades;
    }),

  upgradeHome: protectedProcedure
    .meta({ mcp: { description: "Upgrade or downgrade home" } })
    .input(homeUpgradeInputSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      // Read the account snapshot before inventory so its CAS detects concurrent storage changes.
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) return errorResponse("User not found");
      const useritems = await fetchUserItems(ctx.drizzle, ctx.userId);
      const storedItems = useritems.filter((ui) => ui.storedAtHome);
      // Guard
      if (user.isBanned) return errorResponse("You are banned");
      if (user.homeType === input.homeType)
        return errorResponse("You already own this home type");
      // Derived
      const targetHome = HomeTypeDetails[input.homeType];
      const currentHomeCost = HomeTypeDetails[user.homeType].cost;
      const upgradeCost = Math.max(0, targetHome.cost - currentHomeCost);
      // Upgrading or downgrading
      if (HomeTypes.indexOf(input.homeType) > HomeTypes.indexOf(user.homeType)) {
        if (user.money < upgradeCost) return errorResponse("Not enough Ryo");
        const result = await ctx.drizzle
          .update(userData)
          .set({
            money: sql`${userData.money} - ${upgradeCost}`,
            homeType: input.homeType,
            updatedAt: getNextUserSnapshotAt(user.updatedAt),
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              eq(userData.homeType, user.homeType),
              eq(userData.updatedAt, user.updatedAt),
              gte(userData.money, upgradeCost),
            ),
          );
        if (result.rowsAffected === 0) {
          return errorResponse(
            "Not enough Ryo or home inventory changed. Refresh and try again",
          );
        }
        return { success: true, message: `Upgraded to ${targetHome.name}` };
      } else {
        const storedNormalItems =
          storedItems.filter((ui) => getHomeStorageBucket(ui.item) === "normal")
            .length || 0;
        const storedMaterialItems =
          storedItems.filter((ui) => getHomeStorageBucket(ui.item) === "materials")
            .length || 0;
        const storedCookingItems =
          storedItems.filter((ui) => getHomeStorageBucket(ui.item) === "cooking")
            .length || 0;
        const maxMaterials = getHomeStorageBucketCapacity(
          "materials",
          user,
          targetHome.storage,
        );
        const maxCooking = getHomeStorageBucketCapacity(
          "cooking",
          user,
          targetHome.storage,
        );
        if (storedNormalItems > targetHome.storage) {
          return errorResponse(
            `You need to remove some items from storage first (max ${targetHome.storage})`,
          );
        }
        if (storedMaterialItems > maxMaterials) {
          return errorResponse(
            `You need to remove some materials from storage first (max ${maxMaterials})`,
          );
        }
        if (storedCookingItems > maxCooking) {
          return errorResponse(
            `You need to remove some cooking items from storage first (max ${maxCooking})`,
          );
        }
        const downgradeRefund = Math.floor((currentHomeCost - targetHome.cost) * 0.75);
        const result = await ctx.drizzle
          .update(userData)
          .set({
            homeType: input.homeType,
            money: sql`${userData.money} + ${downgradeRefund}`,
            updatedAt: getNextUserSnapshotAt(user.updatedAt),
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              eq(userData.homeType, user.homeType),
              eq(userData.updatedAt, user.updatedAt),
            ),
          );
        if (result.rowsAffected === 0) {
          return errorResponse("Home inventory changed. Refresh and try again");
        }
        return { success: true, message: `Downgraded to ${targetHome.name}` };
      }
    }),

  toggleStoreItem: protectedProcedure
    .meta({ mcp: { description: "Store or retrieve item from home" } })
    .input(homeStorageInputSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      // Read userData before inventory so the transactional updatedAt CAS below
      // detects any capacity mutation that commits between these snapshots.
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const useritems = await fetchUserItems(ctx.drizzle, ctx.userId);
      const storedItems = useritems.filter((ui) => ui.storedAtHome);
      const nonStoredItems = useritems.filter((ui) => !ui.storedAtHome);
      const userItemResult = useritems.find((ui) => ui.id === input.userItemId);
      // Guard
      if (!user) return errorResponse("User not found");
      if (!userItemResult) return errorResponse("Item not found or is equipped");
      if (!userItemResult.item) return errorResponse("Item data not found");
      if (userItemResult.equipped !== "NONE") {
        return errorResponse("You can't store/retrieve already equipped items");
      }
      // Mutate
      if (userItemResult.storedAtHome) {
        const inventoryBucket = getInventoryBucket(userItemResult.item);
        const bucketCount =
          nonStoredItems.filter((ui) => getInventoryBucket(ui.item) === inventoryBucket)
            .length || 0;
        if (bucketCount >= getInventoryBucketCapacity(inventoryBucket, user)) {
          return errorResponse(getInventoryBucketFullMessage(inventoryBucket));
        }
        const moved = await ctx.drizzle.transaction(async (tx) => {
          const claimResult = await tx
            .update(userData)
            .set({ updatedAt: getNextUserSnapshotAt(user.updatedAt) })
            .where(
              and(
                eq(userData.userId, ctx.userId),
                eq(userData.updatedAt, user.updatedAt),
              ),
            );
          if (claimResult.rowsAffected !== 1) return false;
          const result = await tx
            .update(userItem)
            .set({ storedAtHome: false })
            .where(
              and(
                eq(userItem.id, input.userItemId),
                eq(userItem.userId, ctx.userId),
                eq(userItem.storedAtHome, true),
                gt(userItem.quantity, 0),
              ),
            );
          return result.rowsAffected === 1;
        });
        if (!moved) {
          return errorResponse("Inventory changed, please refresh and try again");
        }
        return { success: true, message: "Item retrieved from your home." };
      } else {
        // Check storage limits based on home-storage bucket
        const homeBucket = getHomeStorageBucket(userItemResult.item);
        const homeStorage = HomeTypeDetails[user.homeType].storage;
        const storedInBucket =
          storedItems.filter((ui) => getHomeStorageBucket(ui.item) === homeBucket)
            .length || 0;
        if (
          storedInBucket >= getHomeStorageBucketCapacity(homeBucket, user, homeStorage)
        ) {
          return errorResponse(getHomeStorageBucketFullMessage(homeBucket));
        }
        const moved = await ctx.drizzle.transaction(async (tx) => {
          const claimResult = await tx
            .update(userData)
            .set({ updatedAt: getNextUserSnapshotAt(user.updatedAt) })
            .where(
              and(
                eq(userData.userId, ctx.userId),
                eq(userData.updatedAt, user.updatedAt),
              ),
            );
          if (claimResult.rowsAffected !== 1) return false;
          const result = await tx
            .update(userItem)
            .set({ storedAtHome: true })
            .where(
              and(
                eq(userItem.id, input.userItemId),
                eq(userItem.userId, ctx.userId),
                eq(userItem.storedAtHome, false),
                gt(userItem.quantity, 0),
              ),
            );
          return result.rowsAffected === 1;
        });
        if (!moved) {
          return errorResponse("Inventory changed, please refresh and try again");
        }
        return { success: true, message: "Item stored in your home." };
      }
    }),
});

/** Cosmetic home writes need account state and its home sector without advancing gameplay timers. */
const fetchHomeFurnitureUser = (client: DrizzleClient, userId: string) =>
  client.query.userData.findFirst({
    where: eq(userData.userId, userId),
    columns: {
      homeType: true,
      homeFurnitureRevision: true,
      isBanned: true,
      status: true,
      sector: true,
      villageId: true,
      isOutlaw: true,
    },
    with: {
      village: { columns: { sector: true } },
      items: {
        where: availableHomeFurnitureItems(),
        with: { item: { with: { variants: true } } },
      },
    },
  });

/** Only available inventory can be placed; auction escrow and unfinished crafts remain inaccessible. */
const availableHomeFurnitureItems = () =>
  and(
    gt(userItem.quantity, 0),
    eq(userItem.isInAuction, false),
    or(
      isNull(userItem.craftingFinishedAt),
      lte(userItem.craftingFinishedAt, new Date()),
    ),
  );

/** Guests can use residence navigation but only the resident can rearrange its furnishings. */
const homeFurnitureAccessError = (
  user: Awaited<ReturnType<typeof fetchHomeFurnitureUser>>,
) => {
  if (!user) return "User not found";
  if (user.isBanned) return "You are banned";
  if (!user.village || user.sector !== user.village.sector)
    return "Return to your own village to furnish your home";
  if (!["AWAKE", "ASLEEP"].includes(user.status))
    return "You cannot furnish your home right now";
  return null;
};

/** Recheck access and the furniture revision in the same statement that publishes the change. */
const homeFurnitureWriteGuard = (
  user: NonNullable<Awaited<ReturnType<typeof fetchHomeFurnitureUser>>>,
  userId: string,
  revision: number,
) =>
  and(
    eq(userData.userId, userId),
    eq(userData.homeFurnitureRevision, revision),
    eq(userData.homeType, user.homeType),
    eq(userData.isBanned, false),
    eq(userData.villageId, user.villageId ?? ""),
    eq(userData.sector, user.sector),
    eq(userData.isOutlaw, user.isOutlaw),
    inArray(userData.status, ["AWAKE", "ASLEEP"]),
  );
