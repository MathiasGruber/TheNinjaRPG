import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import { eq, or, and, sql, gt, isNotNull, desc } from "drizzle-orm";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { COMBAT_SECONDS } from "../../../libs/combat/constants";
import { secondsPassed, secondsFromDate } from "../../../utils/time";
import { defineHex } from "../../../libs/hexgrid";
import { calcBattleResult, maskBattle } from "../../../libs/combat/util";
import { createAction, saveActions } from "../../../libs/combat/database";
import { updateUser, updateBattle } from "../../../libs/combat/database";
import { fetchUser } from "./profile";
import { performAIaction } from "../../../libs/combat/ai_v1";
import { userData } from "../../../../drizzle/schema";
import { battle, battleAction, battleHistory } from "../../../../drizzle/schema";
import { performActionSchema } from "../../../libs/combat/types";
import { performBattleAction } from "../../../libs/combat/actions";
import { availableUserActions } from "../../../libs/combat/actions";
import { realizeTag } from "../../../libs/combat/process";
import { BarrierTag } from "../../../libs/combat/types";
import { combatAssets } from "../../../libs/travel/constants";
import { getServerPusher } from "../../../libs/pusher";
import type { BaseServerResponse } from "../trpc";
import type { Item, UserItem, BattleType } from "../../../../drizzle/schema";
import type { BattleUserState } from "../../../libs/combat/types";
import type { UserEffect, GroundEffect } from "../../../libs/combat/types";
import type { ActionEffect } from "../../../libs/combat/types";
import type { DrizzleClient } from "../../db";

export const combatRouter = createTRPCRouter({
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      // No battle ID
      if (!input.battleId) {
        return { battle: null, result: null };
      }

      // Distinguish between public and non-public user state
      const userBattle = await fetchBattle(ctx.drizzle, input.battleId);
      if (!userBattle) {
        return { battle: null, result: null };
      }

      // Calculate if the battle is over for this user, and if so update user DB
      const { result } = calcBattleResult(
        userBattle.usersState as BattleUserState[],
        ctx.userId,
        userBattle.rewardScaling
      );

      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(userBattle, ctx.userId);

      // Update user & delete the battle if it's done
      if (result) {
        await updateUser(result, userBattle, ctx.userId, ctx.drizzle);
        const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
        if (battleOver) {
          await updateBattle(ctx.drizzle, result, userBattle);
        }
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, result: result };
    }),
  getBattleEntry: protectedProcedure
    .input(
      z.object({
        battleId: z.string(),
        version: z.number(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entry = await ctx.drizzle.query.battleAction.findFirst({
        where: and(
          eq(battleAction.battleId, input.battleId),
          eq(battleAction.battleVersion, input.version)
        ),
        orderBy: desc(battleAction.createdAt),
      });
      return entry !== undefined ? entry : null;
    }),
  performAction: protectedProcedure
    .input(performActionSchema)
    .mutation(async ({ ctx, input }) => {
      // Short-form
      const uid = ctx.userId;
      const db = ctx.drizzle;

      // Create the grid for the battle
      const Tile = defineHex({ dimensions: 1, orientation: Orientation.FLAT });
      const grid = new Grid(
        Tile,
        rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT })
      ).map((tile) => {
        tile.cost = 1;
        return tile;
      });

      // Pusher instance
      const pusher = getServerPusher();

      // Attempt to perform action untill success || error thrown
      // The primary purpose here is that if the battle version was already updated, we retry the user's action
      let attempts = 0;
      while (true) {
        // Fetch battle
        const userBattle = await fetchBattle(db, input.battleId);
        if (!userBattle) {
          return { updateClient: true, battle: null, result: null, notification: null };
        }

        // Cast to correct types
        const usersState = userBattle.usersState as BattleUserState[];
        const usersEffects = userBattle.usersEffects as UserEffect[];
        const groundEffects = userBattle.groundEffects as GroundEffect[];
        const battleDescriptions: string[] = [];

        // Instantiate new state variables
        let newUsersEffects: UserEffect[];
        let newGroundEffects: GroundEffect[];
        let newUsersState: BattleUserState[];
        let actionEffects: ActionEffect[];

        // If userId, actionID, and position specified, perform user action
        if (input.userId && input.longitude && input.latitude && input.actionId) {
          // Get action
          const actions = availableUserActions(usersState, uid);
          const action = actions.find((a) => a.id === input.actionId);
          if (!action) {
            throw serverError("CONFLICT", `Invalid action`);
          }

          // Attempt to perform action
          const newState = performBattleAction({
            usersState,
            usersEffects,
            groundEffects,
            grid,
            action,
            contextUserId: uid,
            actionUserId: input.userId,
            longitude: input.longitude,
            latitude: input.latitude,
          });
          if (!newState) {
            return {
              updateClient: false,
              battle: null,
              result: null,
              notification: "Action no longer possible",
            };
          }
          // Update state variables
          ({ newUsersState, newUsersEffects, newGroundEffects, actionEffects } =
            newState);
          // Add description of battle action, which is used for showing battle log
          battleDescriptions.push(action.battleDescription);
        } else {
          // If no action specified, point new state variables to previous (no copy), preparing for AI action
          newUsersEffects = usersEffects;
          newGroundEffects = groundEffects;
          newUsersState = usersState;
          actionEffects = [];
        }

        // Attempt to perform AI action
        const {
          nextUsersState,
          nextUsersEffects,
          nextGroundEffects,
          nextActionEffects,
          description,
        } = performAIaction(newUsersState, newUsersEffects, newGroundEffects, grid);
        battleDescriptions.push(description);
        actionEffects = actionEffects.concat(nextActionEffects);

        // If no description, means no actions, just return now
        if (!battleDescriptions) {
          throw serverError(
            "BAD_REQUEST",
            "Somehow no battle description generated. Reported to staff and will be investigated!"
          );
        }

        // Calculate if the battle is over for this user, and if so update user DB
        const { finalUsersState, result } = calcBattleResult(
          nextUsersState,
          uid,
          userBattle.rewardScaling
        );

        // Optimistic update for all other users before we process request
        const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
        if (!battleOver) {
          void pusher.trigger(userBattle.id, "event", {
            version: userBattle.version + 1,
          });
        }

        /**
         * DATABASE UPDATES in parallel transaction
         */
        try {
          const newBattle = await updateBattle(
            db,
            result,
            userBattle,
            finalUsersState,
            nextUsersEffects,
            nextGroundEffects
          );

          // Return the new battle + results state if applicable
          const newMaskedBattle = maskBattle(newBattle, uid);
          await createAction(
            battleDescriptions.join(". "),
            userBattle,
            actionEffects,
            db
          );
          await saveActions(db, finalUsersState, result, uid);
          await updateUser(result, newBattle, uid, db);

          // Return the new battle + result state if applicable
          return {
            updateClient: true,
            battle: newMaskedBattle,
            result: result,
            notification: null,
          };
        } catch (e) {
          if (attempts > 2) {
            console.error(e);
            throw e;
          }
        }
        attempts += 1;
      }
    }),
  startArenaBattle: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const ais = await ctx.drizzle.query.userData.findMany({
        where: eq(userData.isAi, 1),
        columns: {
          userId: true,
          level: true,
        },
      });

      const closestAIs = ais.sort((a, b) => {
        return Math.abs(a.level - user.level) - Math.abs(b.level - user.level);
      });
      const selectedAI = closestAIs[0];
      if (selectedAI) {
        return await initiateBattle(
          {
            sector: user.sector,
            userId: user.userId,
            targetId: selectedAI.userId,
            client: ctx.drizzle,
          },
          "ARENA",
          "coliseum.webp"
        );
      } else {
        return { success: false, message: "No AI found" };
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
    .output(baseServerResponse)
    .mutation(async ({ input, ctx }) => {
      return await initiateBattle(
        {
          longitude: input.longitude,
          latitude: input.latitude,
          sector: input.sector,
          userId: ctx.userId,
          targetId: input.userId,
          client: ctx.drizzle,
        },
        "COMBAT"
      );
    }),
});

export const fetchBattle = async (client: DrizzleClient, battleId: string) => {
  return await client.query.battle.findFirst({
    where: eq(battle.id, battleId),
  });
};

export const initiateBattle = async (
  info: {
    longitude?: number;
    latitude?: number;
    sector: number;
    userId: string;
    targetId: string;
    client: DrizzleClient;
  },
  battleType: BattleType,
  background = "forest.webp"
): Promise<BaseServerResponse> => {
  const { longitude, latitude, sector, userId, targetId, client } = info;
  return await client.transaction(async (tx) => {
    // Get user & target data, to be inserted into battle
    const users = await tx.query.userData.findMany({
      with: {
        bloodline: true,
        village: true,
        items: {
          with: { item: true },
          where: (items) => and(gt(items.quantity, 0), isNotNull(items.equipped)),
        },
        jutsus: {
          with: { jutsu: true },
          where: (jutsus) => eq(jutsus.equipped, 1),
        },
      },
      where: or(eq(userData.userId, userId), eq(userData.userId, targetId)),
    });
    users.sort((a) => (a.userId === userId ? -1 : 1));

    // Use long/lat fields for position in combat map
    if (users?.[0]) {
      users[0]["longitude"] = 4;
      users[0]["latitude"] = 2;
    } else {
      return { success: false, message: "Failed to set position of left-hand user" };
    }
    if (users?.[1]) {
      users[1]["longitude"] = 8;
      users[1]["latitude"] = 2;
    } else {
      return { success: false, message: "Failed to set position of right-hand user" };
    }
    if (users[1].immunityUntil > new Date()) {
      return {
        success: false,
        message:
          "Target is immune from combat until " +
          users[1].immunityUntil.toLocaleTimeString(),
      };
    }
    if (users[0].status !== "AWAKE") {
      return { success: false, message: "You are not awake" };
    }
    if (users[1].status !== "AWAKE") {
      return { success: false, message: "Target is not awake" };
    }

    // Get previous battles between these two users within last 60min
    let rewardScaling = 1;
    if (battleType !== "ARENA") {
      const results = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(battleHistory)
        .where(
          and(
            or(
              and(
                eq(battleHistory.attackedId, users[0]["userId"]),
                eq(battleHistory.defenderId, users[1]["userId"])
              ),
              and(
                eq(battleHistory.attackedId, users[1]["userId"]),
                eq(battleHistory.defenderId, users[0]["userId"])
              )
            ),
            gt(battleHistory.createdAt, secondsFromDate(-60 * 60, new Date()))
          )
        );
      const previousBattles = results?.[0]?.count || 0;
      if (previousBattles > 0) {
        rewardScaling = 1 / (previousBattles + 1);
      }
    }

    // Create the users array to be inserted into the battle
    const userEffects: UserEffect[] = [];
    const usersState = users.map((raw) => {
      // Add basics
      const user = raw as BattleUserState;
      user.controllerId = user.userId;
      user.isOriginal = true;

      // Set the updated at to now, so that action bar starts at 0
      if (battleType !== "ARENA") {
        user.updatedAt = new Date();
      } else {
        user.updatedAt = secondsFromDate(-COMBAT_SECONDS / 2, new Date());
      }

      // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
      // Therefore we need to calculate the current pools here, before inserting the user into battle
      const regen =
        (user.bloodline?.regenIncrease
          ? user.regeneration + user.bloodline.regenIncrease
          : user.regeneration) * secondsPassed(user.regenAt);
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);

      // Add highest stats to user
      user.highestOffence = Math.max(
        user.ninjutsuOffence,
        user.genjutsuOffence,
        user.taijutsuOffence,
        user.bukijutsuOffence
      );
      user.highestDefence = Math.max(
        user.ninjutsuOffence,
        user.genjutsuOffence,
        user.taijutsuOffence,
        user.bukijutsuOffence
      );

      // Remember how much money this user had
      user.originalMoney = user.money;

      // Set the history lists to record actions during battle
      user.usedGenerals = [];
      user.usedStats = [];
      user.usedActions = [];

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

      // Set jutsus updatedAt to now (we use it for determining usage cooldowns)
      user.jutsus = user.jutsus.map((userjutsu) => {
        userjutsu.updatedAt = new Date();
        return userjutsu;
      });

      // Add item effects
      const items: (UserItem & { item: Item })[] = [];
      user.items.forEach((useritem) => {
        const itemType = useritem.item.itemType;
        if (itemType === "ARMOR" || itemType === "ACCESSORY") {
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
          useritem.updatedAt = new Date();
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
        // Ignore the spots where we placed users
        const foundUser = usersState.find(
          (u) => u.longitude === col && u.latitude === row
        );
        const rand = Math.random();
        combatAssets.every((asset) => {
          if (rand < asset.chance && !foundUser) {
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
    const battleId = nanoid();
    await tx.insert(battle).values({
      id: battleId,
      battleType: battleType,
      background: background,
      usersState: usersState,
      usersEffects: userEffects,
      groundEffects: groundEffects,
      rewardScaling: rewardScaling,
    });

    // If not arena, create a history entry
    if (battleType !== "ARENA") {
      await tx.insert(battleHistory).values({
        battleId: battleId,
        attackedId: users[0].userId,
        defenderId: users[1].userId,
        createdAt: new Date(),
      });
    }

    // Update users to be in battle, but only if they are currently AWAKE
    const result = await tx
      .update(userData)
      .set({
        status: sql`CASE WHEN isAi = false THEN "BATTLE" ELSE "AWAKE" END`,
        battleId: sql`CASE WHEN isAi = false THEN ${battleId} ELSE NULL END`,
        pvpFights: ["SPARRING", "COMBAT"].includes(battleType)
          ? sql`${userData.pvpFights} + 1`
          : sql`${userData.pvpFights}`,
        pveFights: !["SPARRING", "COMBAT"].includes(battleType)
          ? sql`${userData.pveFights} + 1`
          : sql`${userData.pveFights}`,
        updatedAt: new Date(),
        immunityUntil: ["SPARRING", "COMBAT"].includes(battleType)
          ? sql`CASE WHEN userId = ${users[0].userId} THEN NOW() ELSE immunityUntil END`
          : sql`immunityUntil`,
      })
      .where(
        and(
          or(eq(userData.userId, userId), eq(userData.userId, targetId)),
          eq(userData.status, "AWAKE"),
          ...(battleType === "COMBAT"
            ? [
                and(
                  eq(userData.sector, sector),
                  ...(longitude ? [eq(userData.longitude, longitude)] : []),
                  ...(latitude ? [eq(userData.latitude, latitude)] : [])
                ),
              ]
            : [])
        )
      );
    if (result.rowsAffected !== 2) {
      return { success: false, message: "Attack failed, did the target move?" };
    }
    // Push websockets message to target
    const pusher = getServerPusher();
    void pusher.trigger(targetId, "event", { type: "battle" });

    // Return the battle
    return { success: true, message: battleId };
  });
};
