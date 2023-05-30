import { z } from "zod";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";

import { Prisma } from "@prisma/client";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { defineHex } from "../../../libs/hexgrid";
import { availableUserActions, insertAction } from "../../../libs/combat/actions";
import { applyEffects } from "../../../libs/combat/process";
import { calcBattleResult, maskBattle } from "../../../libs/combat/util";
import { getServerPusher } from "../../../libs/pusher";
import { updateUser, updateBattle, createAction } from "../../../libs/combat/database";
import { secondsPassed } from "../../../utils/time";
import { realizeTag } from "../../../libs/combat/process";
import { BarrierTag } from "../../../libs/combat/types";
import { UserStatus, BattleType, ItemType } from "@prisma/client";
import { combatAssets } from "../../../libs/travel/biome";
import { ais } from "../../../../prisma/seeds/ai";
import { fetchUser } from "./profile";
import type { TerrainHex } from "../../../libs/hexgrid";
import type { Item, UserItem } from "@prisma/client";
import type { Battle, PrismaClient } from "@prisma/client";
import type { GroundEffect, UserEffect } from "../../../libs/combat/types";
import type { BattleUserState } from "../../../libs/combat/types";

const performActionSchema = z.object({
  battleId: z.string().cuid(),
  userId: z.string(),
  actionId: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  version: z.number(),
});
type PerformActionType = z.infer<typeof performActionSchema>;

export const combatRouter = createTRPCRouter({
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().cuid().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      // No battle ID
      if (!input.battleId) {
        return { battle: null, result: null };
      }

      // Distinguish between public and non-public user state
      const battle = await ctx.prisma.battle.findUniqueOrThrow({
        where: { id: input.battleId },
      });

      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(battle, ctx.userId);

      // Calculate if the battle is over for this user, and if so update user DB
      const { result } = calcBattleResult(newMaskedBattle.usersState, ctx.userId);

      // Delete the battle if it's done
      if (result) {
        await updateUser(result, ctx.userId, ctx.prisma);
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, result: result };
    }),
  getBattleEntry: protectedProcedure
    .input(
      z.object({
        battleId: z.string().cuid().optional(),
        version: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.prisma.battleAction.findMany({
        where: {
          battleId: input.battleId,
          battleVersion: input.version,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      return entries?.[0] ? entries[0] : null;
    }),
  performAction: protectedProcedure
    .input(performActionSchema)
    .mutation(async ({ ctx, input }) => {
      // Create the grid for the battle
      const Tile = defineHex({ dimensions: 1, orientation: Orientation.FLAT });
      const grid = new Grid(
        Tile,
        rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT })
      ).map((tile) => {
        tile.cost = 1;
        return tile;
      });

      // Attempt to perform action untill success || error thrown
      while (true) {
        // Fetch battle
        const battle = await ctx.prisma.battle.findUniqueOrThrow({
          where: { id: input.battleId },
        });

        // Optimistic update for all other users before we process request
        const pusher = getServerPusher();
        void pusher.trigger(battle.id, "event", { version: battle.version + 1 });

        // Attempt to perform action
        const {
          action,
          finalUsersState,
          newUsersEffects,
          newGroundEffects,
          actionEffects,
          result,
        } = performAction(battle, ctx.userId, grid, input);

        /**
         * DATABASE UPDATES in parallel transaction
         */
        const newBattle = await ctx.prisma.$transaction(async (tx) => {
          const [newBattle] = await Promise.all([
            updateBattle(
              result,
              battle,
              finalUsersState,
              newUsersEffects,
              newGroundEffects,
              tx
            ),
            createAction(action, battle, actionEffects, tx),
            updateUser(result, ctx.userId, tx),
          ]);
          return newBattle;
        });

        // Return the new battle + results state if applicable
        if (newBattle) {
          const newMaskedBattle = maskBattle(newBattle, ctx.userId);
          return { battle: newMaskedBattle, result: result };
        }
      }
    }),
  startArenaBattle: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.prisma, ctx.userId);
    const closestAIs = [...ais.values()].sort((a, b) => {
      return Math.abs(a.level - user.level) - Math.abs(b.level - user.level);
    });
    const selectedAI = closestAIs[0];
    if (selectedAI) {
      return await initiateBattle(
        {
          sector: user.sector,
          userId: user.userId,
          targetId: selectedAI.userId,
          prisma: ctx.prisma,
        },
        BattleType.ARENA,
        "coliseum.png"
      );
    }
  }),
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
      return await initiateBattle(
        {
          longitude: input.longitude,
          latitude: input.latitude,
          sector: input.sector,
          userId: ctx.userId,
          targetId: input.userId,
          prisma: ctx.prisma,
        },
        BattleType.COMBAT
      );
    }),
});

const performAction = (
  battle: Battle,
  contextUserId: string,
  grid: Grid<TerrainHex>,
  input: PerformActionType
) => {
  // Get valid actions
  const usersState = battle.usersState as unknown as BattleUserState[];
  const usersEffects = battle.usersEffects as unknown as UserEffect[];
  const groundEffects = battle.groundEffects as unknown as GroundEffect[];
  const actions = availableUserActions(usersState, contextUserId);
  const action = actions.find((a) => a.id === input.actionId);
  if (!action) throw serverError("PRECONDITION_FAILED", "Invalid action");

  // Ensure that the userId we're trying to move is valid
  const user = usersState.find(
    (u) => u.controllerId === contextUserId && u.userId === input.userId
  );
  if (!user) throw serverError("PRECONDITION_FAILED", "This is not your user");

  // Perform action, get latest status effects
  // Note: this mutates usersEffects, groundEffects
  const { check, postActionUsersEffects, postActionGroundEffects } = insertAction({
    usersState,
    usersEffects,
    groundEffects,
    grid,
    action,
    userId: input.userId,
    longitude: input.longitude,
    latitude: input.latitude,
  });
  if (!check) {
    throw serverError("PRECONDITION_FAILED", "Requested action not possible anymore");
  }

  // Apply relevant effects, and get back new state + active effects
  const { newUsersState, newUsersEffects, newGroundEffects, actionEffects } =
    applyEffects(usersState, postActionUsersEffects, postActionGroundEffects);

  // Calculate if the battle is over for this user, and if so update user DB
  const { finalUsersState, result } = calcBattleResult(newUsersState, contextUserId);

  return {
    action,
    finalUsersState,
    newUsersEffects,
    newGroundEffects,
    actionEffects,
    result,
  };
};

export const initiateBattle = async (
  info: {
    longitude?: number;
    latitude?: number;
    sector: number;
    userId: string;
    targetId: string;
    prisma: PrismaClient;
  },
  battleType: BattleType,
  background = "forest.webp"
) => {
  const { longitude, latitude, sector, userId, targetId, prisma } = info;
  const battle = await prisma.$transaction(async (tx) => {
    // Get user & target data, to be inserted into battle
    const users = await tx.userData.findMany({
      include: {
        items: {
          include: {
            item: true,
          },
          where: {
            quantity: {
              gt: 0,
            },
            equipped: {
              not: null,
            },
          },
        },
        jutsus: {
          include: {
            jutsu: true,
          },
          where: {
            equipped: true,
          },
        },
        bloodline: true,
        village: true,
      },
      where: {
        OR: [{ userId: userId }, { userId: targetId }],
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

    // Create the users array to be inserted into the battle
    const userEffects: UserEffect[] = [];
    const usersState = users.map((raw) => {
      // Add basics
      const user = raw as BattleUserState;
      user.controllerId = user.userId;
      user.is_original = true;

      // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
      // Therefore we need to calculate the current pools here, before inserting the user into battle
      const regen =
        (user.bloodline?.regenIncrease
          ? user.regeneration + user.bloodline.regenIncrease
          : user.regeneration) * secondsPassed(user.regenAt);
      user.cur_health = Math.min(user.cur_health + regen, user.max_health);
      user.cur_chakra = Math.min(user.cur_chakra + regen, user.max_chakra);
      user.cur_stamina = Math.min(user.cur_stamina + regen, user.max_stamina);

      // Add highest stats to user
      user.highest_offence = Math.max(
        user.ninjutsu_offence,
        user.genjutsu_offence,
        user.taijutsu_offence,
        user.bukijutsu_offence
      );
      user.highest_defence = Math.max(
        user.ninjutsu_offence,
        user.genjutsu_offence,
        user.taijutsu_offence,
        user.bukijutsu_offence
      );

      // Add bloodline efects
      if (user.bloodline?.effects) {
        const effects = user.bloodline.effects as unknown as UserEffect[];
        effects.forEach((effect) => {
          const realized = realizeTag(effect, user, user.level);
          realized.isNew = false;
          realized.targetId = user.userId;
          realized.fromBloodline = true;
          userEffects.push(realized);
        });
      }
      // Add item effects
      const items: (UserItem & { item: Item })[] = [];
      user.items.forEach((useritem) => {
        const itemType = useritem.item.itemType;
        if (itemType === ItemType.ARMOR || itemType === ItemType.ACCESSORY) {
          if (useritem.item.effects) {
            const effects = useritem.item.effects as unknown as UserEffect[];
            effects.forEach((effect) => {
              const realized = realizeTag(effect, user, user.level);
              realized.isNew = false;
              realized.targetId = user.userId;
              userEffects.push(realized);
            });
          }
        } else {
          items.push(useritem);
        }
      });
      user.items = items;
      // Base values
      user.armor = 0;
      user.fledBattle = false;
      user.leftBattle = false;
      return user;
    });

    // Starting ground effects
    const groundEffects: GroundEffect[] = [];
    for (let col = 0; col < COMBAT_WIDTH; col++) {
      for (let row = 0; row < COMBAT_HEIGHT; row++) {
        const rand = Math.random();
        combatAssets.every((asset) => {
          if (rand < asset.chance) {
            const tag: GroundEffect = {
              ...BarrierTag.parse({
                power: 2,
                originalPower: 2,
                calculation: "static",
              }),
              id: `initial-${col}-${row}`,
              creatorId: "ground",
              createdAt: Date.now(),
              level: 0,
              longitude: col,
              latitude: row,
              isNew: false,
              staticAssetPath: asset.filepath + asset.filename,
            };
            groundEffects.push(tag);
            return false;
          }
          return true;
        });
      }
    }

    // Create combat entry
    const battle = await tx.battle.create({
      data: {
        battleType,
        background,
        usersState: usersState as unknown as Prisma.JsonArray,
        usersEffects: userEffects as unknown as Prisma.JsonArray,
        groundEffects: groundEffects as unknown as Prisma.JsonArray,
      },
    });

    // Update users, but only succeed transaction if none of them already had a battle assigned
    const result: number = await tx.$executeRaw`
      UPDATE UserData
      SET
        ${
          battleType === BattleType.COMBAT
            ? Prisma.sql`status = ${UserStatus.BATTLE}, battleId = ${battle.id}, `
            : Prisma.empty
        }
        updatedAt = Now()
      WHERE
        (userId = ${userId} OR userId = ${targetId}) AND  
        status = 'AWAKE' 
        ${
          battleType === BattleType.COMBAT
            ? Prisma.sql`AND sector = ${sector} AND longitude = ${longitude} AND latitude = ${latitude}`
            : Prisma.empty
        }  
        `;
    if (result !== 2) {
      throw new Error(`Attack failed, did the target move?`);
    }
    // Push websockets message to target
    const pusher = getServerPusher();
    void pusher.trigger(targetId, "event", { type: "battle" });

    // Return the battle
    return battle;
  });
  return battle;
};
