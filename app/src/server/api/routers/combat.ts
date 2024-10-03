import { z } from "zod";
import { nanoid } from "nanoid";
import {
  createTRPCRouter,
  protectedProcedure,
  ratelimitMiddleware,
} from "@/server/api/trpc";
import { serverError, baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, or, and, sql, gt, ne, isNotNull, isNull, inArray, gte } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { desc } from "drizzle-orm";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "@/libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "@/libs/travel/constants";
import { COMBAT_LOBBY_SECONDS } from "@/libs/combat/constants";
import { RANKS_RESTRICTED_FROM_PVP, AutoBattleTypes } from "@/drizzle/constants";
import { secondsFromDate, secondsFromNow } from "@/utils/time";
import { calcBattleResult, maskBattle, alignBattle } from "@/libs/combat/util";
import { processUsersForBattle } from "@/libs/combat/util";
import { createAction, saveUsage } from "@/libs/combat/database";
import { updateUser, updateBattle } from "@/libs/combat/database";
import {
  updateVillageAnbuClan,
  updateKage,
  updateClanLeaders,
  updateTournament,
} from "@/libs/combat/database";
import { fetchUpdatedUser, fetchUser } from "./profile";
import { performAIaction } from "@/libs/combat/ai_v1";
import { userData, questHistory, quest, gameSetting } from "@/drizzle/schema";
import { battle, battleAction, battleHistory } from "@/drizzle/schema";
import { villageAlliance, village, tournamentMatch } from "@/drizzle/schema";
import { performActionSchema, statSchema } from "@/libs/combat/types";
import { performBattleAction } from "@/libs/combat/actions";
import { availableUserActions } from "@/libs/combat/actions";
import { calcIsInVillage } from "@/libs/travel/controls";
import { BarrierTag } from "@/libs/combat/types";
import { combatAssetsNames } from "@/libs/travel/constants";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { getRandomElement } from "@/utils/array";
import { applyEffects } from "@/libs/combat/process";
import { manuallyAssignUserStats, scaleUserStats } from "@/libs/profile";
import { capUserStats } from "@/libs/profile";
import { mockAchievementHistoryEntries } from "@/libs/quest";
import { canAccessStructure } from "@/utils/village";
import { fetchSectorVillage } from "@/routers/village";
import { getBattleGrid } from "@/libs/combat/util";
import { BATTLE_ARENA_DAILY_LIMIT } from "@/drizzle/constants";
import { BattleTypes } from "@/drizzle/constants";
import { PvpBattleTypes } from "@/drizzle/constants";
import type { BaseServerResponse } from "@/server/api/trpc";
import type { BattleType } from "@/drizzle/constants";
import type { BattleUserState, StatSchemaType } from "@/libs/combat/types";
import type { GroundEffect } from "@/libs/combat/types";
import type { ActionEffect } from "@/libs/combat/types";
import type { CompleteBattle } from "@/libs/combat/types";
import type { DrizzleClient } from "@/server/db";

// Debug flag when testing battle
const debug = false;

// Pusher instance
const pusher = getServerPusher();

export const combatRouter = createTRPCRouter({
  getBattle: protectedProcedure
    .input(z.object({ battleId: z.string().optional().nullable() }))
    .query(async ({ ctx, input }) => {
      // No battle ID
      if (!input.battleId) {
        return { battle: null, result: null };
      }

      // OUTER LOOP: Attempt to perform action untill success || error thrown
      // The primary purpose here is that if the battle version was already updated, we retry the user's action
      let attempts = 0;
      while (true) {
        try {
          // Increment attempts
          attempts += 1;

          // Distinguish between public and non-public user state
          const userBattle = await fetchBattle(ctx.drizzle, input.battleId);
          if (!userBattle) {
            return { battle: null, result: null };
          }

          // Current state of battle
          const actId = userBattle.activeUserId;
          const activeUser = userBattle.usersState.find((u) => u.userId === actId);
          const hadActivity = userBattle.updatedAt > userBattle.roundStartAt;

          // Update the battle to the correct activeUserId & round. Default to current user
          const fetchedVersion = userBattle.version;
          const { progressRound, changedActor, actionRound } = alignBattle(
            userBattle,
            ctx.userId,
          );
          if (changedActor) userBattle.version = userBattle.version + 1;

          // Calculate if the battle is over for this user, and if so update user DB
          const result = calcBattleResult(userBattle, ctx.userId);

          // Check if the battle is over, or state was updated
          const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
          if (battleOver || progressRound || changedActor) {
            if (!hadActivity && actId && activeUser) {
              const { newBattle, actionEffects } = applyEffects(userBattle, actId);
              await Promise.all([
                updateBattle(
                  ctx.drizzle,
                  result,
                  ctx.userId,
                  newBattle,
                  fetchedVersion,
                ),
                createAction(ctx.drizzle, newBattle, [
                  {
                    battleRound: actionRound,
                    appliedEffects: actionEffects,
                    description: `${activeUser.username} stands and does nothing. `,
                    battleVersion: fetchedVersion,
                  },
                ]),
              ]);
            } else {
              await updateBattle(
                ctx.drizzle,
                result,
                ctx.userId,
                userBattle,
                fetchedVersion,
              );
            }
          }

          // Hide private state of non-session user
          const newMaskedBattle = maskBattle(userBattle, ctx.userId);

          // Update user & delete the battle if it's done
          if (result) {
            await updateUser(ctx.drizzle, pusher, userBattle, result, ctx.userId);
          }

          // Return the new battle + result state if applicable
          return { battle: newMaskedBattle, result: result };
        } catch (e) {
          // If any of the above fails, retry the whole procedure
          if (e instanceof Error) {
            try {
              e.message += ` (Attempt ${attempts})`;
            } catch (e) {
              console.error(e);
            }
          }
          if (attempts > 2) throw e;
        }
      }
    }),
  getBattleEntries: protectedProcedure
    .input(
      z.object({
        battleId: z.string(),
        refreshKey: z.number().optional(),
        checkBattle: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.drizzle.query.battleAction.findMany({
        limit: 30,
        where: eq(battleAction.battleId, input.battleId),
        orderBy: [desc(battleAction.createdAt)],
      });
      return entries;
    }),
  getGraph: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const attacker = alias(userData, "attacker");
      const defender = alias(userData, "defender");
      const results = await ctx.drizzle
        .select({
          attackerId: battleHistory.attackedId,
          defenderId: battleHistory.defenderId,
          attackerUsername: attacker.username,
          defenderUsername: defender.username,
          attackerAvatar: attacker.avatar,
          defenderAvatar: defender.avatar,
          total: sql<number>`COUNT(*)`,
        })
        .from(battleHistory)
        .innerJoin(attacker, eq(battleHistory.attackedId, attacker.userId))
        .innerJoin(defender, eq(battleHistory.defenderId, defender.userId))
        .where(
          and(
            eq(battleHistory.battleType, "COMBAT"),
            or(
              eq(battleHistory.attackedId, input.userId),
              eq(battleHistory.defenderId, input.userId),
            ),
          ),
        )
        .groupBy(battleHistory.attackedId, battleHistory.defenderId);
      const userIds = results
        .flatMap((x) => [x.attackerId, x.defenderId])
        .filter((x) => x !== input.userId);
      if (userIds.length > 0) {
        const level2 = await ctx.drizzle
          .select({
            attackerId: battleHistory.attackedId,
            defenderId: battleHistory.defenderId,
            attackerUsername: attacker.username,
            defenderUsername: defender.username,
            attackerAvatar: attacker.avatar,
            defenderAvatar: defender.avatar,
            total: sql<number>`COUNT(*)`,
          })
          .from(battleHistory)
          .innerJoin(attacker, eq(battleHistory.attackedId, attacker.userId))
          .innerJoin(defender, eq(battleHistory.defenderId, defender.userId))
          .where(
            and(
              eq(battleHistory.battleType, "COMBAT"),
              or(
                and(
                  inArray(battleHistory.attackedId, userIds),
                  ne(battleHistory.defenderId, input.userId),
                ),
                and(
                  inArray(battleHistory.defenderId, userIds),
                  ne(battleHistory.attackedId, input.userId),
                ),
              ),
            ),
          )
          .groupBy(battleHistory.attackedId, battleHistory.defenderId);
        if (level2) results.push(...level2);
      }

      return results;
    }),
  getBattleHistory: protectedProcedure
    .input(
      z.object({
        userId: z.string().optional(),
        secondsBack: z.number().optional(),
        combatTypes: z.array(z.enum(BattleTypes)).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = input.userId || ctx.userId;
      const results = await ctx.drizzle.query.battleHistory.findMany({
        where: and(
          or(
            eq(battleHistory.attackedId, userId),
            eq(battleHistory.defenderId, userId),
          ),
          ...(input.secondsBack
            ? [gt(battleHistory.createdAt, secondsFromNow(-3600 * 3))]
            : []),
          ...(input.combatTypes
            ? [inArray(battleHistory.battleType, input.combatTypes)]
            : []),
        ),
        with: {
          attacker: { columns: { username: true, userId: true, avatar: true } },
          defender: { columns: { username: true, userId: true, avatar: true } },
        },
        orderBy: [desc(battleHistory.createdAt)],
      });
      return results;
    }),
  performAction: protectedProcedure
    .use(ratelimitMiddleware)
    .input(performActionSchema)
    .mutation(async ({ ctx, input }) => {
      if (debug) console.log("============ Performing action ============");

      // Short-form
      const suid = ctx.userId;
      const db = ctx.drizzle;

      // Create the grid for the battle
      const grid = getBattleGrid(1);

      // OUTER LOOP: Attempt to perform action untill success || error thrown
      // The primary purpose here is that if the battle version was already updated, we retry the user's action
      let attempts = 0;
      while (true) {
        // Fetch battle from database
        const battle = await fetchBattle(db, input.battleId);
        if (!battle) return { updateClient: true };

        // For kage battles, only allow one move per action
        const maxActions = AutoBattleTypes.includes(battle.battleType) ? 1 : 5;

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
          const { actor, actionRound } = alignBattle(newBattle, suid);
          if (debug) {
            console.log(`============ 1. Actor: ${actor.username} ============`);
          }

          // Only allow action if it is the users turn
          const isUserTurn = !actor.isAi && actor.controllerId === suid;
          const isAITurn = actor.isAi;
          if (!isUserTurn && !isAITurn) {
            return { notification: `Not your turn. Wait for ${actor.username}` };
          }

          // If userId, actionID, and position specified, perform user action
          const battleDescriptions: string[] = [];
          const actionEffects: ActionEffect[] = [];
          if (
            !isAITurn &&
            isUserTurn &&
            input.longitude !== undefined &&
            input.latitude !== undefined &&
            input.actionId
          ) {
            /* PERFORM USER ACTION */
            const actions = availableUserActions(newBattle, suid, true, true);
            const action = actions.find((a) => a.id === input.actionId);
            if (!action)
              throw serverError("CONFLICT", `Invalid action: ${input.actionId}`);
            if (AutoBattleTypes.includes(battle.battleType)) {
              throw serverError("FORBIDDEN", `Cheater`);
            }
            try {
              const newState = performBattleAction({
                battle: newBattle,
                action,
                grid,
                contextUserId: suid,
                actorId: actor.userId,
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
              const aiState = performAIaction(newBattle, grid, actor.userId);
              newBattle = aiState.nextBattle;
              actionPerformed = true;
              actionEffects.push(...aiState.nextActionEffects);
              battleDescriptions.push(...aiState.aiDescriptions);
              // console.log("STATE SPACE: ", aiState.searchSize);
            } catch (error) {
              let notification = "Unknown Error";
              if (error instanceof Error) notification = error.message;
              return { updateClient: false, notification };
            }
          }

          // If no description, means no actions, just return now
          let description = battleDescriptions.join(". ");
          if (!description && actionPerformed && history.length === 0) {
            return { updateClient: false, notification: "No battle description" };
          }

          // Check if everybody finished their action, and if so, fast-forward the battle
          const { actor: newActor, progressRound } = alignBattle(newBattle);
          if (actionPerformed && progressRound) {
            const dot = description.endsWith(".");
            description += `${dot ? "" : ". "} It is now ${newActor.username}'s turn.`;
          }

          // Add history entry for what happened during this round
          if (description) {
            history.push({
              battleRound: actionRound,
              appliedEffects: actionEffects,
              description: description,
              battleVersion: newBattle.version + nActions,
            });
            nActions += 1;
          }

          // Calculate if the battle is over for this user, and if so update user DB
          const result = calcBattleResult(newBattle, suid);

          // Check if we should let the inner-loop continue
          if (
            newActor.isAi && // Continue new loop if it's an AI
            nActions < maxActions && // and we haven't performed 5 actions yet
            !result && // and the battle is not over for the user
            (newActor.userId !== actor.userId || description) // and new actor, or successful attack
          ) {
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
            // Only push websocket data if there is more than one non-AI in battle
            const nUsers = battle.usersState.filter((u) => !u.isAi).length;
            if (nUsers > 1) {
              void pusher.trigger(battle.id, "event", { version: battle.version + 1 });
            }
          }

          // Only keep visual tags that are newer than original round
          newBattle.groundEffects = newBattle.groundEffects.filter(
            (e) => e.type !== "visual" || e.createdRound >= originalRound,
          );

          /**
           * DATABASE UPDATES in parallel transaction
           */
          try {
            newBattle.version = newBattle.version + nActions;
            await updateBattle(db, result, suid, newBattle, battle.version);
            const [logEntries] = await Promise.all([
              createAction(db, newBattle, history),
              saveUsage(db, newBattle, result, suid),
              updateUser(db, pusher, newBattle, result, suid),
              updateKage(db, newBattle, result, suid),
              updateClanLeaders(db, newBattle, result, suid),
              updateVillageAnbuClan(db, newBattle, result, suid),
              updateTournament(db, newBattle, result, suid),
            ]);
            const newMaskedBattle = maskBattle(newBattle, suid);

            // Return the new battle + result state if applicable
            return {
              updateClient: true,
              battle: newMaskedBattle,
              result: result,
              logEntries: logEntries,
            };
          } catch (e) {
            // If any of the above fails, retry the whole procedure
            if (attempts > 1) throw e;
          }
          attempts += 1;
        }
      }
    }),
  battleArenaHeal: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.money < 500) return errorResponse("You don't have enough money");
      if (user.isBanned) return errorResponse("You are banned");
      // Mutate with guard
      const result = await ctx.drizzle
        .update(userData)
        .set({
          money: user.money - 500,
          curHealth: user.maxHealth,
          curStamina: user.maxStamina,
          curChakra: user.maxChakra,
        })
        .where(and(eq(userData.userId, ctx.userId), gte(userData.money, 500)));
      if (result.rowsAffected === 0) {
        return errorResponse("Error trying to heal and continue. Try again.");
      } else {
        return { success: true, message: "You've healed" };
      }
    }),
  startArenaBattle: protectedProcedure
    .use(ratelimitMiddleware)
    .input(z.object({ aiId: z.string(), stats: statSchema.nullish() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Get information
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      const [selectedAI, sectorVillage] = await Promise.all([
        ctx.drizzle.query.userData.findFirst({
          where: and(
            eq(userData.userId, input.aiId),
            eq(userData.isAi, true),
            eq(userData.isSummon, false),
            eq(userData.inArena, true),
          ),
        }),
        fetchSectorVillage(ctx.drizzle, user?.sector ?? -1),
      ]);
      // Check that user was found
      if (!user) return errorResponse("Attacking user not found");
      if (!sectorVillage) return errorResponse("Arena village not found");
      if (user.isBanned) return errorResponse("No arena while banned");
      if (!input.stats && user.dailyArenaFights >= BATTLE_ARENA_DAILY_LIMIT) {
        return errorResponse("Daily arena limit reached");
      }
      // Check if location is OK
      if (
        !user.isOutlaw &&
        (!calcIsInVillage({ x: user.longitude, y: user.latitude }) ||
          !canAccessStructure(user, "/battlearena", sectorVillage))
      ) {
        return {
          success: false,
          message: "Must be in your allied village to go to arena",
        };
      }
      // Determine battle background
      if (selectedAI) {
        return await initiateBattle(
          {
            sector: user.sector,
            userIds: [user.userId],
            targetIds: [selectedAI.userId],
            client: ctx.drizzle,
            statDistribution: input.stats ?? undefined,
          },
          input.stats ? "TRAINING" : "ARENA",
          determineArenaBackground(user.village?.name || "Unknown"),
        );
      } else {
        return { success: false, message: "No AI found" };
      }
    }),
  attackUser: protectedProcedure
    .use(ratelimitMiddleware)
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
        asset: z.enum(["ocean", "ground", "dessert", "ice"]).optional(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ input, ctx }) => {
      return await initiateBattle(
        {
          longitude: input.longitude,
          latitude: input.latitude,
          sector: input.sector,
          userIds: [ctx.userId],
          targetIds: [input.userId],
          client: ctx.drizzle,
        },
        "COMBAT",
        determineCombatBackground(input.asset || "ground"),
      );
    }),
  iAmHere: protectedProcedure
    .input(z.object({ battleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Fetch
      const userBattle = await fetchBattle(ctx.drizzle, input.battleId);
      const user = userBattle?.usersState.find((u) => u.userId === ctx.userId);
      // Guard
      if (!userBattle) return { success: false, message: "You are not in a battle" };
      if (!user) return { success: false, message: "You are not in this battle" };
      if (new Date() > userBattle.roundStartAt) return { success: true, message: "" };
      // Pre-Mutate
      user.iAmHere = true;
      userBattle.updatedAt = new Date();
      userBattle.version = userBattle.version + 1;
      const allHere = userBattle.usersState.every((u) => u.iAmHere);
      if (allHere) {
        userBattle.createdAt = new Date();
        userBattle.roundStartAt = new Date();
      }
      // Mutate
      const result = await ctx.drizzle
        .update(battle)
        .set({
          usersState: userBattle.usersState,
          version: userBattle.version,
          createdAt: userBattle.createdAt,
          updatedAt: userBattle.updatedAt,
          roundStartAt: userBattle.roundStartAt,
        })
        .where(
          and(
            eq(battle.id, input.battleId),
            eq(battle.version, userBattle.version - 1),
          ),
        );
      if (result.rowsAffected > 0) {
        void pusher.trigger(userBattle.id, "event", {
          version: userBattle.version + 1,
        });
        return { success: true, message: "", battle: userBattle };
      } else {
        return { success: false, message: "Someone else updated the battle state" };
      }
    }),
});

/***********************************************
 * CONVENIENCE FUNCTIONS USED ON COMBAT ENDPOINTS
 ***********************************************/
export const fetchBattle = async (client: DrizzleClient, battleId: string) => {
  const result = await client.query.battle.findFirst({
    where: eq(battle.id, battleId),
  });
  if (!result) {
    return null;
  }
  return result as CompleteBattle;
};

export const determineArenaBackground = (villageName: string) => {
  switch (villageName) {
    case "Konoki":
      return "midjourney_konoki_arena.webp";
    case "Silence":
      return "midjourney_silence_arena.webp";
    default:
      return "coliseum.webp";
  }
};

export const determineCombatBackground = (
  asset: "ocean" | "ground" | "dessert" | "ice",
) => {
  switch (asset) {
    case "ocean":
      return "midjourney_ocean.webp";
    case "ice":
      return "midjourney_ocean.webp";
    case "ground":
      return "midjourney_forest.webp";
    default:
      return "midjourney_dessert.webp";
  }
};

export const initiateBattle = async (
  info: {
    longitude?: number;
    latitude?: number;
    sector?: number;
    userIds: string[];
    targetIds: string[];
    client: DrizzleClient;
    statDistribution?: StatSchemaType;
    scaleTarget?: boolean;
  },
  battleType: BattleType,
  background = "forest.webp",
  scaleGains = 1,
): Promise<BaseServerResponse> => {
  // Destructure
  const { longitude, latitude, sector, userIds, targetIds, client } = info;

  // Get user & target data, to be inserted into battle
  const [settings, villages, relations, achievements, users] = await Promise.all([
    client.select().from(gameSetting),
    client.select().from(village),
    client.select().from(villageAlliance),
    client
      .select()
      .from(quest)
      .where(and(eq(quest.questType, "achievement"), eq(quest.hidden, false))),
    client.query.userData.findMany({
      with: {
        bloodline: true,
        village: {
          with: { structures: true },
        },
        loadout: {
          columns: { jutsuIds: true },
        },
        clan: true,
        items: {
          with: { item: true },
          where: (items) => and(gt(items.quantity, 0), ne(items.equipped, "NONE")),
          orderBy: (table, { desc }) => [desc(table.quantity)],
        },
        jutsus: {
          with: { jutsu: true },
          where: (jutsus) => eq(jutsus.equipped, 1),
          orderBy: (table, { desc }) => [desc(table.level)],
        },
        userQuests: {
          where: or(
            and(isNull(questHistory.endAt), eq(questHistory.completed, 0)),
            eq(questHistory.questType, "achievement"),
          ),
          with: {
            quest: true,
          },
        },
      },
      where: or(inArray(userData.userId, userIds), inArray(userData.userId, targetIds)),
    }),
  ]);

  // Place attackers first
  users.sort((a) => (userIds.includes(a.userId) ? -1 : 1));

  // Check if the villageData is in a pvp enabled zone
  const sectorData = villages.find((v) => v.sector === sector);
  if (sectorData?.pvpDisabled && battleType === "COMBAT") {
    return { success: false, message: "Cannot PvP in this zone" };
  }

  // Loop through each user
  for (let i = 0; i < users.length; i++) {
    // Get the user
    const user = users[i];
    if (!user) return { success: false, message: "Could not find expected user" };

    // If user is banned
    if (user.isBanned) return { success: false, message: `${user.username} is banned` };

    // Check if user is asleep
    if (
      ((user.status !== "AWAKE" && battleType !== "CLAN_BATTLE") ||
        (user.status !== "QUEUED" && battleType === "CLAN_BATTLE")) &&
      !AutoBattleTypes.includes(battleType)
    ) {
      return { success: false, message: `User ${user.username} is not awake` };
    }

    // Rank restrictions
    if (battleType === "COMBAT") {
      if (userIds.includes(user.userId)) {
        if (RANKS_RESTRICTED_FROM_PVP.includes(user.rank)) {
          return { success: false, message: "Need to rank up to do PvP combat" };
        }
      } else {
        if (RANKS_RESTRICTED_FROM_PVP.includes(user.rank) && !user.isAi) {
          return { success: false, message: "Cannot attack students & genin" };
        }
      }
    }

    // Scale targets
    if (info?.scaleTarget && targetIds.includes(user.userId) && users[0]) {
      user.level = users[0].level;
      scaleUserStats(user);
    }

    // Manually Assign Stats
    if (info?.statDistribution && targetIds.includes(user.userId)) {
      manuallyAssignUserStats(user, info?.statDistribution);
    }

    // Add achievements to users for tracking
    user.userQuests.push(...mockAchievementHistoryEntries(achievements, user));

    // Apply caps to user stats
    capUserStats(user);
  }

  // Check immunity on defenders
  if (
    battleType === "COMBAT" &&
    users
      .filter((u) => targetIds.includes(u.userId))
      .some((u) => u.immunityUntil > new Date())
  ) {
    return {
      success: false,
      message: "One of the targets is immune from combat.",
    };
  }

  // Get previous battles between these two users within last 60min
  let rewardScaling = (scaleGains * users.length) / 2;
  if (PvpBattleTypes.includes(battleType)) {
    const results = await client
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(battleHistory)
      .where(
        and(
          or(
            and(
              inArray(battleHistory.attackedId, userIds),
              inArray(battleHistory.defenderId, targetIds),
            ),
            and(
              inArray(battleHistory.attackedId, userIds),
              inArray(battleHistory.defenderId, targetIds),
            ),
          ),
          gt(battleHistory.createdAt, secondsFromDate(-60 * 60, new Date())),
        ),
      );
    const previousBattles = results?.[0]?.count || 0;
    if (previousBattles > 0) {
      rewardScaling = rewardScaling / (previousBattles + 1);
    }
  }

  // Create the users array to be inserted into the battle
  const { userEffects, usersState, allSummons } = processUsersForBattle({
    users: users as BattleUserState[],
    settings: settings,
    relations: relations,
    villages: villages,
    battleType: battleType,
    hide: false,
    leftSideUserIds: userIds,
  });

  // Set attacker to be the agressor
  if (usersState[0]) usersState[0].isAggressor = true;

  // If this is a kage challenge, convert all to be AIs & set them as not originals
  if (AutoBattleTypes.includes(battleType)) {
    usersState.forEach((u) => {
      u.curHealth = u.maxHealth;
      u.curChakra = u.maxChakra;
      u.curStamina = u.maxStamina;
      u.isAi = true;
      u.isOriginal = false;
    });
  }

  // If there are any summonAIs defined, then add them to usersState, but disable them
  if (allSummons.length > 0) {
    const uniqueSummons = [...new Set(allSummons)];
    const summons = await client.query.userData.findMany({
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
      where: inArray(userData.userId, uniqueSummons),
    });
    const { userEffects: summonEffects, usersState: summonState } =
      processUsersForBattle({
        users: summons as BattleUserState[],
        settings: settings,
        relations: relations,
        villages: villages,
        battleType: battleType,
        hide: true,
      });
    summonState.map((u) => (u.isSummon = true));
    userEffects.push(...summonEffects);
    usersState.push(...summonState);
  }

  // Starting ground effects
  const groundEffects: GroundEffect[] = [];
  const assets = Object.values(combatAssetsNames);
  for (let col = 0; col < COMBAT_WIDTH; col++) {
    for (let row = 0; row < COMBAT_HEIGHT; row++) {
      // Ignore the spots where we placed users
      const foundUser = usersState.find(
        (u) => u.longitude === col && u.latitude === row,
      );
      if (!foundUser) {
        const rand = Math.random();
        if (rand < 0.1) {
          const asset = getRandomElement(assets);
          if (asset) {
            const tag: GroundEffect = {
              ...BarrierTag.parse({
                power: 2,
                staticAssetPath: asset,
              }),
              id: `initial-${col}-${row}`,
              creatorId: "ground",
              createdRound: 0,
              level: 0,
              longitude: col,
              latitude: row,
              isNew: false,
              barrierAbsorb: 0,
              castThisRound: false,
            };
            groundEffects.push(tag);
          }
        }
      }
    }
  }

  // Figure out who starts in the battle
  const attackerFirst = !PvpBattleTypes.includes(battleType);
  const activeUser = usersState.sort((a, b) => b.initiative - a.initiative);
  const activeUserId = attackerFirst ? users?.[0]?.userId : activeUser?.[0]?.userId;

  // When to start the battle
  const startTime = !PvpBattleTypes.includes(battleType)
    ? new Date()
    : secondsFromNow(COMBAT_LOBBY_SECONDS);

  // Insert battle entry into DB
  const battleId = nanoid();

  // Insert data
  const [, , userResult] = await Promise.all([
    client.insert(battle).values({
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
    }),
    client.insert(battleHistory).values(
      userIds.flatMap((i) =>
        targetIds.map((t) => ({
          battleId,
          battleType: battleType,
          attackedId: i,
          defenderId: t,
          createdAt: new Date(),
        })),
      ),
    ),
    client
      .update(userData)
      .set({
        status: sql`CASE WHEN isAi = false THEN "BATTLE" ELSE "AWAKE" END`,
        battleId: sql`CASE WHEN isAi = false THEN ${battleId} ELSE NULL END`,
        pvpActivity: ["COMBAT"].includes(battleType)
          ? sql`${userData.pvpActivity} + 1`
          : sql`${userData.pvpActivity}`,
        pvpFights: ["SPARRING", "COMBAT"].includes(battleType)
          ? sql`${userData.pvpFights} + 1`
          : sql`${userData.pvpFights}`,
        pveFights: !["SPARRING", "COMBAT"].includes(battleType)
          ? sql`${userData.pveFights} + 1`
          : sql`${userData.pveFights}`,
        updatedAt: new Date(),
        immunityUntil: ["SPARRING", "COMBAT"].includes(battleType)
          ? sql`CASE WHEN userId IN (${userIds.join(", ")}) THEN NOW() ELSE immunityUntil END`
          : sql`immunityUntil`,
      })
      .where(
        and(
          or(
            inArray(userData.userId, userIds),
            ...(!AutoBattleTypes.includes(battleType)
              ? [inArray(userData.userId, targetIds)]
              : []),
          ),
          or(eq(userData.status, "AWAKE"), eq(userData.status, "QUEUED")),
          ...(battleType === "COMBAT"
            ? [
                and(
                  ...(sector ? [eq(userData.sector, sector)] : []),
                  ...(longitude ? [eq(userData.longitude, longitude)] : []),
                  ...(latitude ? [eq(userData.latitude, latitude)] : []),
                ),
              ]
            : []),
        ),
      ),
    ...(battleType === "TOURNAMENT"
      ? [
          client
            .update(tournamentMatch)
            .set({ battleId })
            .where(
              or(
                and(
                  inArray(tournamentMatch.userId1, userIds),
                  inArray(tournamentMatch.userId2, targetIds),
                ),
                and(
                  inArray(tournamentMatch.userId2, userIds),
                  inArray(tournamentMatch.userId1, targetIds),
                ),
              ),
            ),
        ]
      : []),
  ]);

  // Check if success
  if (
    (AutoBattleTypes.includes(battleType) && userResult.rowsAffected !== 1) ||
    (!AutoBattleTypes.includes(battleType) && userResult.rowsAffected < 2)
  ) {
    await Promise.all([
      client
        .update(userData)
        .set({ status: "AWAKE", battleId: null })
        .where(eq(userData.battleId, battleId)),
      client.delete(battle).where(eq(battle.id, battleId)),
      client.delete(battleHistory).where(eq(battleHistory.battleId, battleId)),
    ]);
    return { success: false, message: "Attack failed, did the target move?" };
  }
  // Push websockets message to target
  const pusher = getServerPusher();

  // Hide users on map when in combat
  if (!["KAGE_CHALLENGE", "CLAN_CHALLENGE"].includes(battleType)) {
    users.forEach((user) => {
      void pusher.trigger(user.userId, "event", { type: "battle" });
      void updateUserOnMap(pusher, user.sector, { ...user, sector: -1 });
    });
  }

  // Return the battle
  return { success: true, message: battleId };
};
