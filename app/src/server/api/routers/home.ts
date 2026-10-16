import {
  and,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { UserStatus } from "@/drizzle/constants";
import {
  HOME_FURNITURE_STORAGE_CAPACITY,
  HOME_MAX_INVITATIONS,
  HomeTypeDetails,
  HomeTypes,
  MAP_WAR_TORN_BATTLEGROUND_SECTOR,
} from "@/drizzle/constants";
import { item, userData, userItem } from "@/drizzle/schema";
import { applyActiveVariant } from "@/libs/combat/util";
import {
  getHomeLayout,
  type HomeFurniture,
  homeLayoutOrientationError,
  homeLayoutOwnershipError,
  homeLayoutPlacementError,
  recoverHomeLayout,
} from "@/libs/home";
import { getHomeRooms, homeRoomStylesError } from "@/libs/homeProperty";
import {
  getHomeStorageBucket,
  getHomeStorageBucketCapacity,
  getHomeStorageBucketFullMessage,
  getInventoryBucket,
  getInventoryBucketCapacity,
  getInventoryBucketFullMessage,
} from "@/libs/item";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { calcIsInVillage, getBiomeFromTileType } from "@/libs/travel";
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
import { retryOnDeadlock } from "@/server/utils/mysqlErrors";
import { getSectorTileType } from "@/server/utils/sectorMap";
import {
  type HomePlacement,
  type HomeRoomStyle,
  homeFurnitureSaveInputSchema,
  homeSharingInputSchema,
  homeSleepResponseSchema,
  homeStorageInputSchema,
  homeUpgradeInputSchema,
  homeVisitInputSchema,
} from "@/validators/home";
import { DEFAULT_FURNITURE_DATA } from "@/validators/itemFurniture";

export const homeRouter = createTRPCRouter({
  /** Return authorized, placed decorations without repairing the owner's home or exposing inventory. */
  getVisitedHome: protectedProcedure
    .input(homeVisitInputSchema)
    .query(async ({ ctx, input }) => {
      const owner = await fetchHomeFurnitureUser(ctx.drizzle, input.userId);
      if (
        !owner ||
        owner.isBanned ||
        owner.isAi ||
        owner.deletionAt ||
        (input.userId !== ctx.userId &&
          !owner.homePublic &&
          !owner.homeInvitations.some(({ userId }) => userId === ctx.userId))
      ) {
        return {
          success: false as const,
          message:
            "This home is private or unavailable. Ask its owner for an invitation.",
          home: null,
        };
      }
      const owned = owner.items.filter(isAvailableOwnedFurniture);
      const furniture = owned.map(homeFurnitureDetails);
      const layout = recoverHomeLayout(getHomeLayout(owned), furniture, owner.homeType);
      const placed = new Set(layout.map(({ id }) => id));
      return {
        success: true as const,
        message: "",
        home: {
          username: owner.username,
          homeType: owner.homeType,
          biome: getHomeBiome(owner),
          styles: owner.homeRoomStyles,
          layout,
          furniture: furniture.filter(({ id }) => placed.has(id)),
        },
      };
    }),

  /** Publish visibility and invitations under one revision guard so concurrent revocations cannot be lost. */
  setHomeSharing: protectedProcedure
    .input(homeSharingInputSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const [owner, invitee] = await Promise.all([
        fetchHomeFurnitureUser(ctx.drizzle, ctx.userId),
        input.inviteUsername
          ? ctx.drizzle.query.userData.findFirst({
              where: eq(userData.username, input.inviteUsername),
              columns: {
                userId: true,
                username: true,
                isAi: true,
                isBanned: true,
                deletionAt: true,
              },
            })
          : Promise.resolve(null),
      ]);
      if (!owner || owner.isBanned) return errorResponse("Home unavailable");
      if (
        input.inviteUsername &&
        (!invitee ||
          invitee.isAi ||
          invitee.isBanned ||
          invitee.deletionAt ||
          invitee.userId === ctx.userId)
      )
        return errorResponse("Choose another active player to invite");
      const invitations = owner.homeInvitations.filter(
        ({ userId }) => userId !== input.revokeUserId,
      );
      if (invitee && !invitations.some(({ userId }) => userId === invitee.userId))
        invitations.push({ userId: invitee.userId, username: invitee.username });
      if (invitations.length > HOME_MAX_INVITATIONS)
        return errorResponse(`You can invite up to ${HOME_MAX_INVITATIONS} players`);
      const result = await ctx.drizzle
        .update(userData)
        .set({
          homePublic: input.isPublic,
          homeInvitations: invitations,
          homeFurnitureRevision: sql`${userData.homeFurnitureRevision} + 1`,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            eq(userData.isBanned, false),
            eq(userData.homeFurnitureRevision, input.revision),
          ),
        );
      return result.rowsAffected
        ? { success: true, message: "Home access updated" }
        : errorResponse("Your home changed. Refresh and try again");
    }),

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
      const furnitureItems = user.items.filter(isAvailableOwnedFurniture);
      return {
        homeType: user.homeType,
        biome: getHomeBiome(user),
        styles: user.homeRoomStyles,
        isPublic: user.homePublic,
        invitations: user.homeInvitations,
        regen: HomeTypeDetails[user.homeType].regen,
        storage: HomeTypeDetails[user.homeType].storage,
        furniture: furnitureItems.map(homeFurnitureDetails),
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
      const furniture = user.items.filter(isAvailableOwnedFurniture);
      const stylesError = homeRoomStylesError(
        input.styles ??
          user.homeRoomStyles.filter(({ room }) =>
            getHomeRooms(user.homeType).some(({ id }) => id === room),
          ),
        user.homeType,
      );
      if (stylesError) return errorResponse(stylesError);
      const ownershipError = homeLayoutOwnershipError(input.placements, furniture);
      if (ownershipError) return errorResponse(ownershipError);
      const placedIds = new Set(input.placements.map(({ id }) => id));
      const projectedStorage = user.items.filter(
        (owned) =>
          owned.item.itemType === "FURNITURE" &&
          !owned.item.hidden &&
          (owned.storedAtHome ||
            (isAvailableOwnedFurniture(owned) &&
              (owned.homeX !== null || placedIds.has(owned.id)))),
      ).length;
      if (projectedStorage > HOME_FURNITURE_STORAGE_CAPACITY)
        return errorResponse(
          "Your furniture storage is full. Retrieve some furniture before saving",
        );
      const pieces = furniture.map(homeFurnitureDetails);
      const orientationError = homeLayoutOrientationError(input.placements, pieces);
      if (orientationError) return errorResponse(orientationError);
      const placementError = homeLayoutPlacementError(
        input.placements,
        pieces,
        user.homeType,
      );
      if (placementError) return errorResponse(placementError);
      const result = await publishHomeFurnitureLayout(
        ctx.drizzle,
        ctx.userId,
        user,
        input.placements,
        input.revision,
        input.styles,
      );
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
            homeFurnitureRevision: sql`${userData.homeFurnitureRevision} + 1`,
            money: sql`${userData.money} - ${upgradeCost}`,
            homeType: input.homeType,
            updatedAt: getNextUserSnapshotAt(user.updatedAt),
          })
          .where(
            and(
              eq(userData.userId, ctx.userId),
              eq(userData.homeType, user.homeType),
              eq(userData.homeFurnitureRevision, user.homeFurnitureRevision),
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
        const retainedRooms = new Set(getHomeRooms(input.homeType).map(({ id }) => id));
        const projectedFurnitureStorage = useritems.filter(
          (owned) =>
            owned.item.itemType === "FURNITURE" &&
            (owned.storedAtHome ||
              (!retainedRooms.has(owned.homeRoom) && owned.homeX !== null)),
        ).length;
        if (projectedFurnitureStorage > HOME_FURNITURE_STORAGE_CAPACITY)
          return errorResponse(
            "Your furniture storage is full. Retrieve some furniture before downgrading",
          );
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
        // As with layout saves, Drizzle needs a joined statement to publish both tables atomically.
        // LEFT JOIN also refunds homes with no removed placements; the owner is updated once.
        // Escrow keeps its storage state so active furniture trades remain fulfillable.
        const result = await retryOnDeadlock(() =>
          ctx.drizzle.execute(sql`
            UPDATE ${userData}
            LEFT JOIN ${userItem} ON ${userItem.userId} = ${userData.userId}
              AND ${isNotNull(userItem.homeX)}
              AND ${notInArray(userItem.homeRoom, [...retainedRooms])}
            SET ${userData.homeFurnitureRevision} = ${userData.homeFurnitureRevision} + 1,
                ${userData.homeRoomStyles} = ${JSON.stringify(user.homeRoomStyles.filter(({ room }) => retainedRooms.has(room)))},
                ${userData.homeType} = ${input.homeType},
                ${userData.money} = ${userData.money} + ${downgradeRefund},
                ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt)},
                ${userItem.homeX} = NULL,
                ${userItem.homeY} = NULL,
                ${userItem.homeRoom} = ${"main"},
                ${userItem.homeRotation} = 0,
                ${userItem.storedAtHome} = CASE WHEN ${userItem.isInAuction}
                  THEN ${userItem.storedAtHome} ELSE ${true} END
            WHERE ${and(
              eq(userData.userId, ctx.userId),
              eq(userData.homeType, user.homeType),
              eq(userData.homeFurnitureRevision, user.homeFurnitureRevision),
              eq(userData.updatedAt, user.updatedAt),
            )}
          `),
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
      updatedAt: true,
      homeRoomStyles: true,
      homePublic: true,
      homeInvitations: true,
      username: true,
      isAi: true,
      deletionAt: true,
      isBanned: true,
      status: true,
      sector: true,
      villageId: true,
      isOutlaw: true,
    },
    with: {
      village: { columns: { sector: true } },
      items: {
        where: gt(userItem.quantity, 0),
        with: { item: { with: { variants: true } } },
      },
    },
  });

type HomeFurnitureUser = NonNullable<
  Awaited<ReturnType<typeof fetchHomeFurnitureUser>>
>;

/** Home scenery follows the owner's village even while the owner or visitor travels. */
const getHomeBiome = (user: HomeFurnitureUser) =>
  user.village
    ? getBiomeFromTileType(getSectorTileType(user.village.sector))
    : "ground";

/** Only visible, completed furniture outside auction escrow is available for placement. */
const isAvailableOwnedFurniture = (owned: HomeFurnitureUser["items"][number]) =>
  owned.item.itemType === "FURNITURE" &&
  !owned.item.hidden &&
  !owned.isInAuction &&
  (!owned.craftingFinishedAt || owned.craftingFinishedAt <= new Date());

/**
 * Publish placements, finishes and their revision together.
 * Saves store newly placed or removed pieces, preserving unplaced carried inventory.
 * Omitted styles retain the saved finishes.
 */
const publishHomeFurnitureLayout = (
  client: DrizzleClient,
  userId: string,
  user: HomeFurnitureUser,
  placements: HomePlacement[],
  revision: number,
  styles?: HomeRoomStyle[],
) => {
  const placementCase = (field: "room" | "x" | "y" | "rotation") => {
    const fallback = field === "room" ? "main" : field === "rotation" ? 0 : null;
    return placements.length
      ? sql`CASE ${userItem.id} ${sql.join(
          placements.map(
            (placement) =>
              sql`WHEN ${placement.id} THEN ${placement[field] ?? fallback}`,
          ),
          sql` `,
        )} ELSE ${fallback} END`
      : sql`${fallback}`;
  };
  // Drizzle's update builder targets one table. A joined update avoids partial rooms and
  // one save overwriting a concurrent edit, without a transaction.
  // A concurrent sale can only remove a placement; this statement never recreates inventory.
  return retryOnDeadlock(() =>
    client.execute(sql`
    UPDATE ${userData}
    LEFT JOIN (${userItem} INNER JOIN ${item} ON ${item.id} = ${userItem.itemId})
      ON ${userItem.userId} = ${userData.userId}
      AND ${availableHomeFurnitureItems()}
      AND ${item.itemType} = ${"FURNITURE"} AND ${item.hidden} = ${false}
    SET ${userData.homeFurnitureRevision} = ${userData.homeFurnitureRevision} + 1,
        ${userData.updatedAt} = ${getNextUserSnapshotAt(user.updatedAt)},
        ${userData.homeRoomStyles} = ${JSON.stringify(styles ?? user.homeRoomStyles)},
        ${userItem.storedAtHome} = CASE WHEN (${userItem.homeX} IS NOT NULL ${
          placements.length
            ? sql`OR ${inArray(
                userItem.id,
                placements.map(({ id }) => id),
              )}`
            : sql``
        }) THEN ${true} ELSE ${userItem.storedAtHome} END,
        ${userItem.homeRoom} = ${placementCase("room")},
        ${userItem.homeX} = ${placementCase("x")},
        ${userItem.homeY} = ${placementCase("y")},
        ${userItem.homeRotation} = ${placementCase("rotation")}
    WHERE ${homeFurnitureWriteGuard(user, userId, revision)}
  `),
  );
};

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

/** The joined inventory snapshot supplies the same active-view geometry to reads and save guards. */
const homeFurnitureDetails = (
  owned: Pick<
    HomeFurnitureUser["items"][number],
    "id" | "itemId" | "quantity" | "activeVariantId" | "item"
  >,
): HomeFurniture => {
  const content = applyActiveVariant(owned);
  const data = content.furnitureData ?? DEFAULT_FURNITURE_DATA;
  return {
    id: owned.id,
    itemId: owned.itemId,
    name: content.name,
    image: content.image,
    width: data.width,
    groundAnchor: data.groundAnchor,
    geometry: data.geometry,
    action: data.action,
    isFloor: data.isFloor,
    quantity: owned.quantity,
    views: data.views ?? {},
  };
};

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
    eq(userData.updatedAt, user.updatedAt),
    eq(userData.homeType, user.homeType),
    eq(userData.isBanned, false),
    eq(userData.villageId, user.villageId ?? ""),
    eq(userData.sector, user.sector),
    eq(userData.isOutlaw, user.isOutlaw),
    inArray(userData.status, ["AWAKE", "ASLEEP"]),
  );
