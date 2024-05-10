import { z } from "zod";
import { nanoid } from "nanoid";
import {
  createTRPCRouter,
  protectedProcedure,
  ratelimitMiddleware,
} from "@/server/api/trpc";
import { serverError, baseServerResponse, errorResponse } from "@/server/api/trpc";
import { eq, or, and, sql, gt, ne, isNotNull, isNull, inArray } from "drizzle-orm";
import { desc } from "drizzle-orm";
import { Grid, rectangle, Orientation } from "honeycomb-grid";
import { COMBAT_HEIGHT, COMBAT_WIDTH } from "@/libs/combat/constants";
import { SECTOR_HEIGHT, SECTOR_WIDTH } from "@/libs/travel/constants";
import { COMBAT_LOBBY_SECONDS } from "@/libs/combat/constants";
import { RANKS_RESTRICTED_FROM_PVP } from "@/drizzle/constants";
import { secondsFromDate, secondsFromNow } from "@/utils/time";
import { defineHex } from "@/libs/hexgrid";
import { calcBattleResult, maskBattle, alignBattle } from "@/libs/combat/util";
import { calcIsStunned } from "@/libs/combat/util";
import { processUsersForBattle } from "@/libs/combat/util";
import { createAction, saveUsage } from "@/libs/combat/database";
import { updateUser, updateBattle } from "@/libs/combat/database";
import { updateVillage, updateKage } from "@/libs/combat/database";
import { fetchUpdatedUser } from "./profile";
import { performAIaction } from "@/libs/combat/ai_v1";
import { userData, questHistory, quest } from "@/drizzle/schema";
import { battle, battleAction, battleHistory } from "@/drizzle/schema";
import { villageAlliance, village } from "@/drizzle/schema";
import { performActionSchema } from "@/libs/combat/types";
import { performBattleAction } from "@/libs/combat/actions";
import { availableUserActions } from "@/libs/combat/actions";
import { calcIsInVillage } from "@/libs/travel/controls";
import { BarrierTag } from "@/libs/combat/types";
import { combatAssetsNames } from "@/libs/travel/constants";
import { getServerPusher } from "@/libs/pusher";
import { getRandomElement } from "@/utils/array";
import { applyEffects } from "@/libs/combat/process";
import { Logger } from "next-axiom";
import { scaleUserStats } from "@/libs/profile";
import { capUserStats } from "@/libs/profile";
import { mockAchievementHistoryEntries } from "@/libs/quest";
import { randomInt } from "@/utils/math";
import { canAccessStructure } from "@/utils/village";
import { fetchSectorVillage } from "@/routers/village";
import { BATTLE_ARENA_DAILY_LIMIT } from "@/drizzle/constants";
import type { BaseServerResponse } from "@/server/api/trpc";
import type { BattleType } from "@/drizzle/constants";
import type { BattleUserState } from "@/libs/combat/types";
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
          const { progressRound, actionRound } = alignBattle(userBattle, ctx.userId);
          if (progressRound) userBattle.version = userBattle.version + 1;

          // Calculate if the battle is over for this user, and if so update user DB
          const result = calcBattleResult(userBattle, ctx.userId);

          // Check if the battle is over, or state was updated
          const battleOver = result && result.friendsLeft + result.targetsLeft === 0;
          if (battleOver || progressRound) {
            if (!hadActivity && actId && activeUser) {
              const { newBattle, actionEffects } = applyEffects(userBattle, actId);
              await Promise.all([
                updateBattle(ctx.drizzle, result, newBattle, fetchedVersion),
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
              await updateBattle(ctx.drizzle, result, userBattle, fetchedVersion);
            }
          }

          // Hide private state of non-session user
          const newMaskedBattle = maskBattle(userBattle, ctx.userId);

          // Update user & delete the battle if it's done
          if (result) {
            await updateUser(ctx.drizzle, userBattle, result, ctx.userId);
          }

          // Return the new battle + result state if applicable
          return { battle: newMaskedBattle, result: result };
        } catch (e) {
          // If any of the above fails, retry the whole procedure
          if (e instanceof Error) e.message += ` (Attempt ${attempts})`;
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
  getBattleHistory: protectedProcedure.query(async ({ ctx }) => {
    const results = await ctx.drizzle.query.battleHistory.findMany({
      where: and(
        or(
          eq(battleHistory.attackedId, ctx.userId),
          eq(battleHistory.defenderId, ctx.userId),
        ),
        gt(battleHistory.createdAt, secondsFromNow(-3600 * 3)),
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

      // Logger for battle metrics
      const log = new Logger();

      // Short-form
      const suid = ctx.userId;
      const db = ctx.drizzle;

      // Create the grid for the battle
      const Tile = defineHex({ dimensions: 1, orientation: Orientation.FLAT });
      const grid = new Grid(
        Tile,
        rectangle({ width: COMBAT_WIDTH, height: COMBAT_HEIGHT }),
      ).map((tile) => {
        tile.cost = 1;
        return tile;
      });

      // OUTER LOOP: Attempt to perform action untill success || error thrown
      // The primary purpose here is that if the battle version was already updated, we retry the user's action
      let attempts = 0;
      while (true) {
        // Fetch battle from database
        const battle = await fetchBattle(db, input.battleId);
        if (!battle) return { updateClient: true };

        // For kage battles, only allow one move per action
        const maxActions = battle.battleType === "KAGE" ? 1 : 5;

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
          const { actor, actionRound, isStunned } = alignBattle(newBattle, suid);
          if (debug) {
            console.log(`============ 1. Actor: ${actor.username} ============`);
          }

          // Only allow action if it is the users turn
          const isUserTurn = !actor.isAi && actor.controllerId === suid;
          const isAITurn = actor.isAi;
          if (!isStunned && !isUserTurn && !isAITurn) {
            return { notification: `Not your turn. Wait for ${actor.username}` };
          }

          // If userId, actionID, and position specified, perform user action
          const battleDescriptions: string[] = [];
          const actionEffects: ActionEffect[] = [];
          if (
            !isAITurn &&
            (isUserTurn || isStunned) &&
            input.longitude !== undefined &&
            input.latitude !== undefined &&
            input.actionId
          ) {
            /* PERFORM USER ACTION */
            const actions = availableUserActions(newBattle, suid, true, true);
            const action = actions.find((a) => a.id === input.actionId);
            if (!action) throw serverError("CONFLICT", `Invalid action`);
            if (battle.battleType === "KAGE") throw serverError("FORBIDDEN", `Cheater`);
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
              log.error("BattleError-UserAction", { input: input, notification });
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
              log.info("AIv1-Search", { actions: aiState.searchSize });
              // console.log("STATE SPACE: ", aiState.searchSize);
            } catch (error) {
              let notification = "Unknown Error";
              if (error instanceof Error) notification = error.message;
              log.error("BattleError-AiAction", { input: input });
              return { updateClient: false, notification };
            }
          }

          // If no description, means no actions, just return now
          let description = battleDescriptions.join(". ");
          if (!description && actionPerformed && history.length === 0) {
            log.error("BattleError-NoDescription", { input: input });
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

          // If newActor is stunned, go through another round
          if (calcIsStunned(newBattle, newActor.userId)) {
            input.actionId = "move";
            input.longitude = 1;
            input.latitude = 1;
            continue;
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
            log.error("BattleError-StateUnchanged", {
              input: input,
              attempts,
              progressRound,
              isAITurn,
              isUserTurn,
              isStunned,
              actor: actor.username,
              newActor: newActor.username,
            });
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
            await updateBattle(db, result, newBattle, battle.version);
            const [logEntries] = await Promise.all([
              createAction(db, newBattle, history),
              saveUsage(db, newBattle, result, suid),
              updateUser(db, newBattle, result, suid),
              updateKage(db, newBattle, result, suid),
              updateVillage(db, newBattle, result, suid),
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
  startArenaBattle: protectedProcedure
    .use(ratelimitMiddleware)
    .input(z.object({ aiId: z.string() }))
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
            eq(userData.isAi, 1),
            eq(userData.isSummon, 0),
          ),
        }),
        fetchSectorVillage(ctx.drizzle, user?.sector ?? -1),
      ]);
      // Check that user was found
      if (!user) return errorResponse("Attacking user not found");
      if (!sectorVillage) return errorResponse("Arena village not found");
      if (user.isBanned) return errorResponse("No arena while banned");
      if (user.dailyArenaFights >= BATTLE_ARENA_DAILY_LIMIT) {
        return errorResponse("Daily arena limit reached");
      }
      // Check if location is OK
      if (
        !calcIsInVillage({ x: user.longitude, y: user.latitude }) ||
        !canAccessStructure(user, "/battlearena", sectorVillage)
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
            userId: user.userId,
            targetId: selectedAI.userId,
            client: ctx.drizzle,
          },
          "ARENA",
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
          userId: ctx.userId,
          targetId: input.userId,
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
    userId: string;
    targetId: string;
    client: DrizzleClient;
    scaleTarget?: boolean;
  },
  battleType: BattleType,
  background = "forest.webp",
): Promise<BaseServerResponse> => {
  // Destructure
  const { longitude, latitude, sector, userId, targetId, client } = info;

  // Get user & target data, to be inserted into battle
  const [villages, relations, achievements, users] = await Promise.all([
    client.select().from(village),
    client.select().from(villageAlliance),
    client.select().from(quest).where(eq(quest.questType, "achievement")),
    client.query.userData.findMany({
      with: {
        bloodline: true,
        village: {
          with: { structures: true },
        },
        loadout: {
          columns: { jutsuIds: true },
        },
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
      where: or(eq(userData.userId, userId), eq(userData.userId, targetId)),
    }),
  ]);
  users.sort((a) => (a.userId === userId ? -1 : 1));

  // Use long/lat fields for position in combat map
  if (users?.[0]) {
    users[0]["longitude"] = randomInt(1, 5);
    users[0]["latitude"] = randomInt(1, 3);
  } else {
    return { success: false, message: "Failed to set position of left-hand user" };
  }
  if (users?.[1]) {
    users[1]["longitude"] = randomInt(7, 11);
    users[1]["latitude"] = randomInt(1, 3);
  } else {
    return { success: false, message: "Failed to set position of right-hand user" };
  }
  if (users[1].immunityUntil > new Date() && battleType === "COMBAT") {
    return {
      success: false,
      message:
        "Target is immune from combat until " +
        users[1].immunityUntil.toLocaleTimeString(),
    };
  }
  if (users[0].status !== "AWAKE") {
    return { success: false, message: "Aggressor is not awake" };
  }
  if (users[1].status !== "AWAKE" && battleType !== "KAGE") {
    return { success: false, message: "Defender is not awake" };
  }

  // If defender is student it is a no-go
  if (battleType === "COMBAT") {
    if (RANKS_RESTRICTED_FROM_PVP.includes(users[0].rank)) {
      return { success: false, message: "Need to rank up to do PvP combat" };
    }
    if (RANKS_RESTRICTED_FROM_PVP.includes(users[1].rank) && users[1].isAi === 0) {
      return { success: false, message: "Cannot attack students & genin" };
    }
  }

  // Add achievements to users for tracking
  users[0].userQuests.push(...mockAchievementHistoryEntries(achievements, users[0]));
  users[1].userQuests.push(...mockAchievementHistoryEntries(achievements, users[1]));

  // If requested scale the target user to the same level & stats as attacker
  if (info?.scaleTarget) {
    users[1].level = users[0].level;
    scaleUserStats(users[1]);
  }

  // Apply caps to user stats
  users.map((u) => capUserStats(u));

  // Get previous battles between these two users within last 60min
  let rewardScaling = 1;
  if (!["ARENA", "QUEST"].includes(battleType)) {
    const results = await client
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(battleHistory)
      .where(
        and(
          or(
            and(
              eq(battleHistory.attackedId, users[0]["userId"]),
              eq(battleHistory.defenderId, users[1]["userId"]),
            ),
            and(
              eq(battleHistory.attackedId, users[1]["userId"]),
              eq(battleHistory.defenderId, users[0]["userId"]),
            ),
          ),
          gt(battleHistory.createdAt, secondsFromDate(-60 * 60, new Date())),
        ),
      );
    const previousBattles = results?.[0]?.count || 0;
    if (previousBattles > 0) {
      rewardScaling = 1 / (previousBattles + 1);
    }
  }

  // Create the users array to be inserted into the battle
  const { userEffects, usersState, allSummons } = processUsersForBattle({
    users: users as BattleUserState[],
    relations: relations,
    villages: villages,
    battleType: battleType,
    hide: false,
  });

  // Set attacker to be the agressor
  if (usersState[0]) usersState[0].isAggressor = true;

  // If this is a kage challenge, convert all to be AIs & set them as not originals
  if (battleType === "KAGE") {
    usersState.forEach((u) => {
      u.curHealth = u.maxHealth;
      u.curChakra = u.maxChakra;
      u.curStamina = u.maxStamina;
      u.isAi = 1;
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
        relations: relations,
        villages: villages,
        battleType: battleType,
        hide: true,
      });
    summonState.map((u) => (u.isSummon = 1));
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
  const attRoll = (users[0] as BattleUserState).initiative;
  const defRoll = (users[1] as BattleUserState).initiative;
  const attackerFirst = attRoll >= defRoll || ["ARENA", "QUEST"].includes(battleType);
  const activeUserId = attackerFirst ? users[0].userId : users[1].userId;

  // When to start the battle
  const startTime = ["ARENA", "KAGE", "QUEST"].includes(battleType)
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
    client.insert(battleHistory).values({
      battleId: battleId,
      attackedId: users[0].userId,
      defenderId: users[1].userId,
      createdAt: new Date(),
    }),
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
        pveFights: !["SPARRING", "COMBAT", "KAGE"].includes(battleType)
          ? sql`${userData.pveFights} + 1`
          : sql`${userData.pveFights}`,
        updatedAt: new Date(),
        immunityUntil: ["SPARRING", "COMBAT"].includes(battleType)
          ? sql`CASE WHEN userId = ${users[0].userId} THEN NOW() ELSE immunityUntil END`
          : sql`immunityUntil`,
      })
      .where(
        and(
          or(
            eq(userData.userId, userId),
            ...(battleType !== "KAGE" ? [eq(userData.userId, targetId)] : []),
          ),
          eq(userData.status, "AWAKE"),
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
  ]);

  // Check if success
  if (
    (battleType === "KAGE" && userResult.rowsAffected !== 1) ||
    (battleType !== "KAGE" && userResult.rowsAffected !== 2)
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
  void pusher.trigger(targetId, "event", { type: "battle" });

  // Hide users on map when in combat
  if (battleType !== "KAGE") {
    void pusher.trigger(users[0].sector.toString(), "event", {
      userId: users[0].userId,
      longitude: users[0].longitude,
      latitude: users[0].latitude,
      avatar: users[0].avatar,
      sector: -1,
      location: users[0].location,
    });
    void pusher.trigger(users[1].sector.toString(), "event", {
      userId: users[1].userId,
      longitude: users[1].longitude,
      latitude: users[1].latitude,
      avatar: users[1].avatar,
      sector: -1,
      location: users[1].location,
    });
  }

  // Return the battle
  return { success: true, message: battleId };
};
