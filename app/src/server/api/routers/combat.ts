import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import { eq, or, and, sql, gt, isNotNull, desc } from "drizzle-orm";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "../../../libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "../../../libs/travel/constants";
import { COMBAT_LOBBY_SECONDS, COMBAT_SECONDS } from "../../../libs/combat/constants";
import { secondsPassed, secondsFromDate, secondsFromNow } from "../../../utils/time";
import { defineHex } from "../../../libs/hexgrid";
import { calcBattleResult, maskBattle, alignBattle } from "../../../libs/combat/util";
import { createAction, saveUsage } from "../../../libs/combat/database";
import { updateUser, updateBattle } from "../../../libs/combat/database";
import { fetchUser } from "./profile";
import { performAIaction } from "../../../libs/combat/ai_v1";
import { userData } from "../../../../drizzle/schema";
import { battle, battleAction, battleHistory } from "../../../../drizzle/schema";
import { performActionSchema } from "../../../libs/combat/types";
import { performBattleAction } from "../../../libs/combat/actions";
import { availableUserActions } from "../../../libs/combat/actions";
import { calcActiveUser } from "../../../libs/combat/actions";
import { realizeTag } from "../../../libs/combat/process";
import { BarrierTag } from "../../../libs/combat/types";
import { combatAssets } from "../../../libs/travel/constants";
import { getServerPusher } from "../../../libs/pusher";
import type { BaseServerResponse } from "../trpc";
import type { Item, UserItem, BattleType } from "../../../../drizzle/schema";
import type { BattleUserState } from "../../../libs/combat/types";
import type { UserEffect, GroundEffect } from "../../../libs/combat/types";
import type { ActionEffect } from "../../../libs/combat/types";
import type { CompleteBattle } from "../../../libs/combat/types";
import type { DrizzleClient } from "../../db";
import { C } from "drizzle-orm/select.types.d-1d455120";

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
      const result = calcBattleResult(userBattle, ctx.userId);

      // Hide private state of non-session user
      const newMaskedBattle = maskBattle(userBattle, ctx.userId);

      // Update user & delete the battle if it's done
      if (result) {
        await updateUser(ctx.drizzle, userBattle, result, ctx.userId);
        const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
        if (battleOver) {
          await updateBattle(ctx.drizzle, result, userBattle, 1);
        }
      }

      // Return the new battle + result state if applicable
      return { battle: newMaskedBattle, result: result };
    }),
  getBattleEntries: protectedProcedure
    .input(z.object({ battleId: z.string(), refreshKey: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      const entries = await ctx.drizzle.query.battleAction.findMany({
        limit: 10,
        where: eq(battleAction.battleId, input.battleId),
        orderBy: [desc(battleAction.createdAt)],
      });
      return entries;
    }),
  performAction: protectedProcedure
    .input(performActionSchema)
    .mutation(async ({ ctx, input }) => {
      // Short-form
      const suid = ctx.userId;
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

      // OUTER LOOP: Attempt to perform action untill success || error thrown
      // The primary purpose here is that if the battle version was already updated, we retry the user's action
      let attempts = 0;
      while (true) {
        // Fetch battle from database
        const battle = await fetchBattle(db, input.battleId);
        if (!battle) return { updateClient: true };

        // Instantiate new state variables
        const history: {
          battleRound: number;
          appliedEffects: ActionEffect[];
          description: string;
          battleVersion: number;
        }[] = [];

        // Remember original values for round & activeUserId
        const originalRound = battle.round;
        const originalActiveUserId = battle.activeUserId;

        // Battle state to update during inner loop
        let newBattle: CompleteBattle = battle;
        let actionPerformed = false;
        let nActions = 0;

        // INNER LOOP: Keep updating battle state until all actions have been performed
        while (true) {
          // Update the battle to the correct activeUserId & round. Default to current user
          const { actor, actionRound } = alignBattle(battle, input.userId ?? suid);

          // Only allow action if it is the users turn
          const isUserTurn = actor.controllerId === suid;
          const isAITurn = actor.isAi && actor.controllerId === actor.userId;
          if (!isUserTurn && !isAITurn) {
            return { notification: `Not your turn. Wait for ${actor.username}` };
          }

          // If userId, actionID, and position specified, perform user action
          const battleDescriptions: string[] = [];
          const actionEffects: ActionEffect[] = [];
          if (
            isUserTurn &&
            input.longitude !== undefined &&
            input.latitude !== undefined &&
            input.actionId
          ) {
            /* PERFORM USER ACTION */
            const actions = availableUserActions(battle, suid);
            const action = actions.find((a) => a.id === input.actionId);
            if (!action) throw serverError("CONFLICT", `Invalid action`);
            try {
              const newState = performBattleAction({
                battle,
                action,
                grid,
                contextUserId: suid,
                userId: actor.userId,
                longitude: input.longitude,
                latitude: input.latitude,
              });
              newBattle = newState.newBattle;
              actionPerformed = true;
              actionEffects.push(...newState.actionEffects);
              battleDescriptions.push(action.battleDescription);
            } catch (error) {
              let notification = "Unknown Error";
              if (error instanceof Error) notification = error.message;
              return { updateClient: false, notification };
            }
          } else if (isAITurn) {
            /* PERFORM AI ACTION */
            try {
              const aiState = performAIaction(newBattle, grid);
              newBattle = aiState.nextBattle;
              actionPerformed = true;
              actionEffects.push(...aiState.nextActionEffects);
              battleDescriptions.push(...aiState.aiDescriptions);
            } catch (error) {
              let notification = "Unknown Error";
              if (error instanceof Error) notification = error.message;
              return { updateClient: false, notification };
            }
          }

          // If no description, means no actions, just return now
          let description = battleDescriptions.join(". ");
          if (!description && actionPerformed) {
            return { updateClient: false, notification: "No battle description" };
          }

          // Check if everybody finished their action, and if so, fast-forward the battle
          const { actor: newActor, progressRound } = alignBattle(newBattle);
          if (actionPerformed && progressRound) {
            const dot = description.endsWith(".");
            description += `${dot ? "" : ". "} It is now ${newActor.username}'s turn.`;
          }

          // Add history entry for what happened during this round
          history.push({
            battleRound: actionRound,
            appliedEffects: actionEffects,
            description: description,
            battleVersion: newBattle.version + nActions,
          });
          nActions += 1;

          // Calculate if the battle is over for this user, and if so update user DB
          const result = calcBattleResult(newBattle, suid);

          // Check if we should let the inner-loop continue
          if (
            newActor.isAi &&
            newActor.controllerId === newActor.userId &&
            nActions < 5 &&
            !result
          ) {
            console.log("AI turn, continuing inner loop", nActions);
            continue;
          }

          // If battle state didn't change, just return without updating battle version
          if (
            !actionPerformed &&
            newBattle.round === originalRound &&
            newBattle.activeUserId === originalActiveUserId
          ) {
            return { notification: `Battle state was not changed` };
          }

          // Optimistic update for all other users before we process request. Also increment version
          const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
          if (!battleOver) {
            void pusher.trigger(battle.id, "event", { version: battle.version + 1 });
          }

          /**
           * DATABASE UPDATES in parallel transaction
           */
          try {
            await updateBattle(db, result, newBattle, nActions);
            const [logEntries] = await Promise.all([
              createAction(db, newBattle, history),
              saveUsage(db, newBattle, result, suid),
              updateUser(db, newBattle, result, suid),
            ]);
            const newMaskedBattle = maskBattle(newBattle, suid);
            newMaskedBattle.version = newBattle.version + 1;

            // Return the new battle + result state if applicable
            return {
              updateClient: true,
              battle: newMaskedBattle,
              result: result,
              logEntries: logEntries,
            };
          } catch (e) {
            // If any of the above fails, retry the whole procedure
            console.log("Error: ", e);
            if (attempts > 1) throw e;
          }
          attempts += 1;
        }
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
  const result = await client.query.battle.findFirst({
    where: eq(battle.id, battleId),
  });
  if (!result) {
    return null;
  }
  return result as CompleteBattle;
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
  console.log("------------------------------------------");
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
      user.updatedAt = new Date();

      // Add regen to pools. Pools are not updated "live" in the database, but rather are calculated on the frontend
      // Therefore we need to calculate the current pools here, before inserting the user into battle
      const regen =
        (user.bloodline?.regenIncrease
          ? user.regeneration + user.bloodline.regenIncrease
          : user.regeneration) * secondsPassed(user.regenAt);
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);

      // Add highest stat name to user
      const offences = {
        ninjutsuOffence: user.ninjutsuOffence,
        genjutsuOffence: user.genjutsuOffence,
        taijutsuOffence: user.taijutsuOffence,
        bukijutsuOffence: user.bukijutsuOffence,
      };
      type offenceKey = keyof typeof offences;
      user.highestOffence = Object.keys(offences).reduce((prev, cur) =>
        offences[prev as offenceKey] > offences[cur as offenceKey] ? prev : cur
      ) as offenceKey;
      const defences = {
        ninjutsuDefence: user.ninjutsuDefence,
        genjutsuDefence: user.genjutsuDefence,
        taijutsuDefence: user.taijutsuDefence,
        bukijutsuDefence: user.bukijutsuDefence,
      };
      type defenceKey = keyof typeof defences;
      user.highestDefence = Object.keys(defences).reduce((prev, cur) =>
        defences[prev as defenceKey] > defences[cur as defenceKey] ? prev : cur
      ) as defenceKey;

      // Remember how much money this user had
      user.originalMoney = user.money;
      user.actionPoints = 100;

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
          realized.castThisRound = false;
          realized.targetId = user.userId;
          realized.fromBloodline = true;
          userEffects.push(realized);
        });
      }

      // Set jutsus updatedAt to now (we use it for determining usage cooldowns)
      user.jutsus = user.jutsus
        .filter((userjutsu) => {
          return (
            userjutsu.jutsu.bloodlineId === "" ||
            user.bloodlineId === userjutsu.jutsu.bloodlineId
          );
        })
        .map((userjutsu) => {
          userjutsu.updatedAt = secondsFromNow(
            -userjutsu.jutsu.cooldown * COMBAT_SECONDS
          );
          return userjutsu;
        });

      // Add item effects
      const items: (UserItem & { item: Item })[] = [];
      user.items.forEach((useritem) => {
        const itemType = useritem.item.itemType;
        if (itemType === "ARMOR" || itemType === "ACCESSORY") {
          if (useritem.item.effects && useritem.equipped !== "NONE") {
            const effects = useritem.item.effects as unknown as UserEffect[];
            effects.forEach((effect) => {
              const realized = realizeTag(effect, user, user.level);
              realized.isNew = false;
              realized.castThisRound = false;
              realized.targetId = user.userId;
              userEffects.push(realized);
            });
          }
        } else {
          useritem.updatedAt = secondsFromNow(-useritem.item.cooldown * COMBAT_SECONDS);
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
              createdRound: 0,
              level: 0,
              longitude: col,
              latitude: row,
              isNew: false,
              castThisRound: false,
              staticAssetPath: asset.filepath + asset.filename,
            };
            groundEffects.push(tag);
            return false;
          }
          return true;
        });
      }
    }

    // Figure out which user goes first. Default to attacker, but if defender in own village, they go first
    let activeUserId = users[0].userId;
    if (users[1].sector === users[1].village?.sector) {
      activeUserId = users[1].userId;
    }

    // Create combat entry
    const battleId = nanoid();
    const startTime =
      battleType === "ARENA" ? new Date() : secondsFromNow(COMBAT_LOBBY_SECONDS);
    await tx.insert(battle).values({
      id: battleId,
      battleType: battleType,
      background: background,
      usersState: usersState,
      usersEffects: userEffects,
      groundEffects: groundEffects,
      rewardScaling: rewardScaling,
      createdAt: startTime,
      updatedAt: startTime,
      roundStartAt: startTime,
      activeUserId: activeUserId,
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
