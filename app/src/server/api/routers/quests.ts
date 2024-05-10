import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "@/api/trpc";
import { secondsFromNow } from "@/utils/time";
import { inArray, lte, isNotNull, isNull, sql, asc, gte } from "drizzle-orm";
import { eq, or, and } from "drizzle-orm";
import { item, jutsu, badge, bankTransfers } from "@/drizzle/schema";
import { userJutsu, userItem, userData, userBadge } from "@/drizzle/schema";
import { quest, questHistory, actionLog, village } from "@/drizzle/schema";
import { QuestValidator } from "@/validators/objectives";
import { fetchUser, fetchUpdatedUser } from "@/routers/profile";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { LetterRanks, QuestTypes } from "@/drizzle/constants";
import HumanDiff from "human-object-diff";
import { initiateBattle, determineCombatBackground } from "@/routers/combat";
import { allObjectiveTasks } from "@/validators/objectives";
import { availableLetterRanks, availableRanks } from "@/libs/train";
import { getNewTrackers, getReward } from "@/libs/quest";
import { getActiveObjectives } from "@/libs/quest";
import { setEmptyStringsToNulls } from "@/utils/typeutils";
import { missionHallSettings } from "@/libs/quest";
import { deleteSenseiRequests } from "@/routers/sensei";
import { getQuestCounterFieldName } from "@/validators/user";
import { getRandomElement } from "@/utils/array";
import { fetchUserItems } from "@/routers/item";
import { MISSIONS_PER_DAY } from "@/drizzle/constants";
import type { CollectItemType } from "@/validators/objectives";
import type { SQL } from "drizzle-orm";
import type { QuestType } from "@/drizzle/constants";
import type { UserData, Quest } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";

export const questsRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
        questType: z.enum(QuestTypes).optional(),
        objectiveTask: z.enum(allObjectiveTasks).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.quest.findMany({
        with: { village: true },
        where: and(
          ...[
            input.questType
              ? eq(quest.questType, input.questType)
              : isNotNull(quest.questType),
          ],
          ...(input.objectiveTask
            ? [
                sql`JSON_SEARCH(${quest.content},'one',${input.objectiveTask}) IS NOT NULL`,
              ]
            : []),
        ),
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  get: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await fetchQuest(ctx.drizzle, input.id);
      if (!result) {
        throw serverError("NOT_FOUND", "Quest not found");
      }
      return result;
    }),
  missionHall: protectedProcedure.query(async ({ ctx }) => {
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });
    const summary = await ctx.drizzle
      .select({
        type: quest.questType,
        rank: quest.requiredRank,
        count: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(quest)
      .where(
        and(
          inArray(quest.questType, ["mission", "errand", "crime"]),
          or(
            isNull(quest.requiredVillage),
            eq(quest.requiredVillage, user?.villageId ?? ""),
          ),
        ),
      )
      .groupBy(quest.questType, quest.requiredRank);
    return summary;
  }),
  startRandom: protectedProcedure
    .input(
      z.object({
        type: z.enum(["errand", "mission"]),
        rank: z.enum(LetterRanks),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch user
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        return errorResponse("User does not exist");
      }
      // Fetch settings
      const settings = missionHallSettings.find(
        (s) => s.type === input.type && s.rank === input.rank,
      );
      if (!settings) {
        return errorResponse("Settings not found");
      }
      // Guards
      if (user.isBanned) return errorResponse("You are banned");
      if (user.dailyMissions >= MISSIONS_PER_DAY) return errorResponse("Limit reached");
      // Check if user is allowed to perform this rank
      const ranks = availableLetterRanks(user.rank);
      if (!ranks.includes(input.rank)) {
        return errorResponse(`Rank ${input.rank} not allowed`);
      }
      // Confirm user does not have any current active missions/crimes/errands
      const current = user?.userQuests?.find(
        (q) => ["mission", "crime", "errand"].includes(q.quest.questType) && !q.endAt,
      );
      if (current) {
        return errorResponse(`Already active ${current.questType}`);
      }
      // Fetch quest
      const results = await ctx.drizzle.query.quest.findMany({
        where: and(
          eq(quest.questType, input.type),
          eq(quest.requiredRank, input.rank),
          eq(quest.hidden, 0),
          or(
            isNull(quest.requiredVillage),
            eq(quest.requiredVillage, user.villageId ?? ""),
          ),
        ),
      });
      const result = getRandomElement(results);
      if (!result) return errorResponse("No assignments at this level could be found");

      // Insert quest entry
      await Promise.all([
        upsertQuestEntry(ctx.drizzle, user, result),
        ctx.drizzle
          .update(userData)
          .set({ dailyMissions: sql`${userData.dailyMissions} + 1` })
          .where(eq(userData.userId, user.userId)),
      ]);
      return { success: true, message: `Quest started: ${result.name}` };
    }),
  abandon: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        throw serverError("PRECONDITION_FAILED", "User does not exist");
      }
      const current = user?.userQuests?.find((q) => q.questId === input.id && !q.endAt);
      if (!current) {
        throw serverError("PRECONDITION_FAILED", `No active quest with id ${input.id}`);
      }
      if (!["mission", "crime", "event", "errand"].includes(current.questType)) {
        throw serverError("PRECONDITION_FAILED", `Cannot abandon ${current.questType}`);
      }
      await Promise.all([
        ctx.drizzle
          .update(questHistory)
          .set({ completed: 0, endAt: new Date() })
          .where(
            and(
              eq(questHistory.questId, input.id),
              eq(questHistory.userId, ctx.userId),
            ),
          ),
        ctx.drizzle
          .update(userData)
          .set({ questFinishAt: new Date() })
          .where(eq(userData.userId, ctx.userId)),
      ]);
      return { success: true, message: `Quest abandoned` };
    }),
  getQuestHistory: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.questHistory.findMany({
        where: eq(questHistory.userId, ctx.userId),
        with: {
          quest: true,
        },
        offset: skip,
        limit: input.limit,
      });
      const nextCursor = results.length < input.limit ? null : currentCursor + 1;
      return {
        data: results,
        nextCursor: nextCursor,
      };
    }),
  update: protectedProcedure
    .input(z.object({ id: z.string(), data: QuestValidator }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      setEmptyStringsToNulls(input.data);
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchQuest(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Prepare data for insertion into database
        const data = input.data;
        // Check we only give ranks with exams
        if (data.content.reward.reward_rank !== "NONE" && data.questType !== "exam") {
          data.content.reward.reward_rank = "NONE";
        }
        data.content.objectives.forEach((objective) => {
          if (objective.reward_rank !== "NONE" && data.questType !== "exam") {
            objective.reward_rank = "NONE";
          }
        });
        // Calculate diff
        const diff = new HumanDiff({ objectName: "item" }).diff(entry, {
          id: entry.id,
          expiresAt: entry.expiresAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Check if quest is changed to be an event
        if (entry.questType !== "event" && input.data.questType === "event") {
          const roles = availableRanks(input.data.requiredRank);
          await upsertQuestEntries(
            ctx.drizzle,
            entry,
            and(
              inArray(userData.rank, roles),
              gte(userData.updatedAt, secondsFromNow(-60 * 60 * 24 * 7)),
            ),
          );
        }
        // Update database
        await Promise.all([
          ctx.drizzle.update(quest).set(input.data).where(eq(quest.id, entry.id)),
          ctx.drizzle
            .update(questHistory)
            .set({ questType: input.data.questType })
            .where(eq(questHistory.questId, entry.id)),
          ctx.drizzle.insert(actionLog).values({
            id: nanoid(),
            userId: ctx.userId,
            tableName: "quest",
            changes: diff,
            relatedId: entry.id,
            relatedMsg: `Update: ${entry.name}`,
            relatedImage: entry.image,
          }),
        ]);
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, entry.name, diff, entry.image);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit quest` };
      }
    }),
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(quest).values({
        id: id,
        name: `New Quest - ${id}`,
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        description: "",
        timeFrame: "all_time",
        questType: "mission",
        hidden: 1,
        content: {
          objectives: [],
          reward: {
            reward_money: 0,
            reward_exp: 0,
            reward_tokens: 0,
            reward_prestige: 0,
            reward_jutsus: [],
            reward_badges: [],
            reward_items: [],
            reward_rank: "NONE",
          },
        },
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create quest` };
    }
  }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchQuest(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        await Promise.all([
          ctx.drizzle.delete(quest).where(eq(quest.id, input.id)),
          ctx.drizzle.delete(questHistory).where(eq(questHistory.questId, input.id)),
        ]);
        return { success: true, message: `Quest deleted` };
      } else {
        return { success: false, message: `Not allowed to delete quest` };
      }
    }),
  checkRewards: protectedProcedure
    .input(z.object({ questId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        throw serverError("PRECONDITION_FAILED", "User does not exist");
      }

      // Figure out if any finished quests & get rewards
      const { rewards, trackers, userQuest, resolved } = getReward(user, input.questId);
      user.questData = trackers;

      // Update user quest data
      if (resolved && userQuest) {
        // Achievements are only inserted once completed
        if (userQuest.quest.questType === "achievement") {
          await upsertQuestEntry(ctx.drizzle, user, userQuest.quest);
        } else {
          user.userQuests = user.userQuests.filter((q) => q.questId !== input.questId);
          const { trackers } = getNewTrackers(user, [{ task: "any" }]);
          user.questData = trackers;
        }
      }

      // Sensei rewards
      const hasSensei = user.senseiId && user.rank === "GENIN";
      const isMission = userQuest?.quest.questType === "mission";
      const senseiId = hasSensei && isMission ? user.senseiId : null;

      // Get potential items to delete
      const itemQuests = userQuest?.quest.content.objectives.filter(
        (o) => o.task === "collect_item" && o.delete_on_complete && o.collect_item_id,
      ) as CollectItemType[];
      const deleteItemIds = itemQuests.map((o) => o.collect_item_id) as string[];

      // Fetch names from the database
      const [items, jutsus, badges, useritems] = await Promise.all([
        // Fetch names from the database
        rewards.reward_items.length > 0
          ? ctx.drizzle
              .select({ id: item.id, name: item.name })
              .from(item)
              .where(inArray(item.id, rewards.reward_items))
          : [],
        rewards.reward_jutsus.length > 0
          ? ctx.drizzle
              .select({ id: jutsu.id, name: jutsu.name })
              .from(jutsu)
              .leftJoin(userJutsu, eq(jutsu.id, userJutsu.jutsuId))
              .where(
                and(inArray(jutsu.id, rewards.reward_jutsus), isNull(userJutsu.userId)),
              )
          : [],
        rewards.reward_badges.length > 0
          ? ctx.drizzle
              .select({ id: badge.id, name: badge.name, image: badge.image })
              .from(badge)
              .leftJoin(
                userBadge,
                and(eq(badge.id, userBadge.badgeId), eq(userBadge.userId, ctx.userId)),
              )
              .where(
                and(inArray(badge.id, rewards.reward_badges), isNull(userBadge.userId)),
              )
          : [],
        deleteItemIds.length > 0 ? fetchUserItems(ctx.drizzle, ctx.userId) : null,
      ]);

      // Filter down the items to be deleted to only those the user has
      const deleteUserItemIds = deleteItemIds
        .filter((id) => useritems?.find((i) => i.itemId === id))
        .map((id) => useritems?.find((i) => i.itemId === id)?.id) as string[];

      // New tier quest
      const questTier = user.userQuests?.find((q) => q.quest.questType === "tier");
      if (!questTier) {
        await insertNextQuest(ctx.drizzle, user, "tier");
      }

      // Update userdata
      const getNewRank = rewards.reward_rank !== "NONE";
      const updatedUserData: { [key: string]: any } = {
        questData: user.questData,
        money: user.money + rewards.reward_money,
        earnedExperience: user.earnedExperience + rewards.reward_exp,
        villagePrestige: user.villagePrestige + rewards.reward_prestige,
        rank: getNewRank ? rewards.reward_rank : user.rank,
      };

      // If the quest is finished, we update additional fields on the userData model
      if (resolved) {
        // Update the finishAt timer
        updatedUserData["questFinishAt"] = new Date();
        // Update various counters on the user model
        const field = getQuestCounterFieldName(
          userQuest?.quest.questType,
          userQuest?.quest.requiredRank,
        );
        if (field) {
          updatedUserData[field] = sql`${userData[field]} + 1`;
        }
      }

      // Update database
      await Promise.all([
        // Update userdata
        ctx.drizzle
          .update(userData)
          .set(updatedUserData)
          .where(eq(userData.userId, ctx.userId)),
        // If new rank, then delete sensei requests
        getNewRank ? deleteSenseiRequests(ctx.drizzle, ctx.userId) : undefined,
        // Update village tokens
        rewards.reward_tokens > 0 && user.villageId
          ? ctx.drizzle
              .update(village)
              .set({ tokens: sql`${village.tokens} + ${rewards.reward_tokens}` })
              .where(eq(village.id, user.villageId))
          : undefined,
        // Update quest history
        resolved
          ? ctx.drizzle
              .update(questHistory)
              .set({
                completed: 1,
                previousCompletes: sql`${questHistory.previousCompletes} + 1`,
                endAt: new Date(),
              })
              .where(
                and(
                  eq(questHistory.questId, input.questId),
                  eq(questHistory.userId, ctx.userId),
                ),
              )
          : undefined,
        // Delete quest items
        deleteItemIds.length > 0
          ? ctx.drizzle
              .delete(userItem)
              .where(
                and(
                  eq(userItem.userId, ctx.userId),
                  inArray(userItem.id, deleteUserItemIds),
                ),
              )
          : undefined,
        // Insert items & jutsus
        ...[
          jutsus.length > 0 &&
            ctx.drizzle.insert(userJutsu).values(
              jutsus.map(({ id }) => ({
                id: nanoid(),
                userId: ctx.userId,
                jutsuId: id,
              })),
            ),
        ],
        // Update sensei with 1000 ryo for missions
        ...(senseiId
          ? [
              ctx.drizzle
                .update(userData)
                .set({ money: sql`${userData.money} + 1000` })
                .where(eq(userData.userId, senseiId)),
              ctx.drizzle.insert(bankTransfers).values({
                senderId: ctx.userId,
                receiverId: senseiId,
                amount: 1000,
              }),
            ]
          : []),
        // Insert items
        ...[
          items.length > 0 &&
            ctx.drizzle.insert(userItem).values(
              items.map(({ id }) => ({
                id: nanoid(),
                userId: ctx.userId,
                itemId: id,
              })),
            ),
        ],
        // Insert achievements/badges
        ...[
          badges.length > 0 &&
            ctx.drizzle.insert(userBadge).values(
              badges.map(({ id }) => ({
                id: nanoid(),
                userId: ctx.userId,
                badgeId: id,
              })),
            ),
        ],
      ]);
      // Update rewards for readability
      rewards.reward_items = items.map((i) => i.name);
      rewards.reward_jutsus = jutsus.map((i) => i.name);
      rewards.reward_badges = badges.map((i) => i.name);
      return { rewards, userQuest, resolved, badges };
    }),
  checkLocationQuest: protectedProcedure
    .output(z.object({ success: z.boolean(), notifications: z.array(z.string()) }))
    .mutation(async ({ ctx }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        throw serverError("PRECONDITION_FAILED", "User does not exist");
      }
      const { trackers, notifications, consequences } = getNewTrackers(user, [
        { task: "move_to_location" },
        { task: "collect_item" },
        { task: "defeat_opponents" },
      ]);
      user.questData = trackers;
      // Items collected & opponents to attack
      const collected = consequences.filter((c) => c.type === "item");
      let opponent = consequences.find((c) => c.type === "combat");
      // If no opponent set, check if any objectives have attackers set
      const activeObjectives = getActiveObjectives(user);
      if (!opponent) {
        activeObjectives.forEach((objective) => {
          if (objective.attackers.length > 0 && objective.attackers_chance > 0) {
            const random = Math.random();
            if (random * 100 < objective.attackers_chance) {
              const idx = Math.floor(Math.random() * objective.attackers.length);
              const randomOpponent = objective.attackers[idx] as string;
              opponent = {
                type: "combat",
                id: randomOpponent,
                scale: objective.attackers_scaled_to_user,
              };
              notifications.push("You have been attacked!");
            }
          }
          if (opponent) return;
        });
      }
      // Database updates
      if (notifications.length > 0) {
        await Promise.all([
          // Update quest data
          ctx.drizzle
            .update(userData)
            .set({ questData: user.questData })
            .where(eq(userData.userId, ctx.userId)),
          // Update collected items
          ...(collected.map(({ id }) =>
            ctx.drizzle.insert(userItem).values({
              id: nanoid(),
              userId: ctx.userId,
              itemId: id,
              quantity: 1,
              equipped: "NONE",
            }),
          ) || []),
          // Initiate battle if needed
          ...[
            opponent
              ? initiateBattle(
                  {
                    longitude: user.longitude,
                    latitude: user.latitude,
                    sector: user.sector,
                    userId: user.userId,
                    targetId: opponent.id,
                    client: ctx.drizzle,
                    scaleTarget: opponent.scale ? true : false,
                  },
                  "ARENA",
                  determineCombatBackground("ground"),
                )
              : undefined,
          ],
        ]);
      }
      return {
        success: notifications.length > 0 ? true : false,
        notifications,
      };
    }),
});

/**
 * COMMON QUERIES WHICH ARE REUSED
 */

export const fetchQuest = async (client: DrizzleClient, id: string) => {
  return await client.query.quest.findFirst({
    where: eq(quest.id, id),
  });
};

export const fetchUncompletedQuests = async (
  client: DrizzleClient,
  user: UserData,
  type: QuestType,
) => {
  const availableLetters = availableLetterRanks(user.rank);
  const history = await client
    .select()
    .from(quest)
    .leftJoin(
      questHistory,
      and(eq(quest.id, questHistory.questId), eq(questHistory.userId, user.userId)),
    )
    .where(
      and(
        eq(quest.questType, type),
        lte(quest.requiredLevel, user.level),
        inArray(quest.requiredRank, availableLetters),
        isNull(questHistory.completed),
        or(
          isNull(quest.requiredVillage),
          eq(quest.requiredVillage, user.villageId ?? ""),
        ),
      ),
    )
    .orderBy((table) => [asc(table.Quest.requiredLevel), asc(table.Quest.tierLevel)]);
  return history.map((quest) => quest.Quest);
};

/** Upsert quest entries for all users by selector. NOTE: selector determined which users get updated/inserted entries */
export const upsertQuestEntries = async (
  client: DrizzleClient,
  quest: Quest,
  updateSelector: SQL<unknown> | undefined,
) => {
  // Users to insert for
  const users = await client
    .select({ userId: userData.userId })
    .from(userData)
    .leftJoin(
      questHistory,
      and(eq(questHistory.userId, userData.userId), eq(questHistory.questId, quest.id)),
    )
    .where(and(updateSelector, isNull(questHistory.id)));
  if (users.length > 0) {
    await client.insert(questHistory).values(
      users.map((user) => ({
        id: nanoid(),
        userId: user.userId,
        questId: quest.id,
        questType: quest.questType,
      })),
    );
  }
  // Users to update for (including those we just inserted for)
  const allUsers = await client
    .select({ userId: userData.userId })
    .from(userData)
    .where(updateSelector);
  if (allUsers.length > 0) {
    await client
      .update(questHistory)
      .set({ completed: 0, endAt: null, startedAt: new Date() })
      .where(
        and(
          inArray(
            questHistory.userId,
            allUsers.map((user) => user.userId),
          ),
          eq(questHistory.questId, quest.id),
        ),
      );
  }
};

/** Upsert quest entry for a single user */
export const upsertQuestEntry = async (
  client: DrizzleClient,
  user: UserData,
  quest: Quest,
) => {
  const current = await client.query.questHistory.findFirst({
    where: and(
      eq(questHistory.questId, quest.id),
      eq(questHistory.userId, user.userId),
    ),
  });
  if (current) {
    const logEntry = {
      startedAt: new Date(),
      endAt: null,
      completed: 0,
    };
    await client
      .update(questHistory)
      .set(logEntry)
      .where(eq(questHistory.id, current.id));
    return { ...current, ...logEntry };
  } else {
    const logEntry = {
      id: nanoid(),
      userId: user.userId,
      questId: quest.id,
      questType: quest.questType,
      startedAt: new Date(),
      endAt: null,
      completed: 0,
      previousCompletes: 0,
    };
    await client.insert(questHistory).values(logEntry);
    return logEntry;
  }
};

export const insertNextQuest = async (
  client: DrizzleClient,
  user: UserData,
  type: QuestType,
) => {
  const history = await fetchUncompletedQuests(client, user, type);
  const nextQuest = history?.[0];
  if (nextQuest) {
    const logEntry = await upsertQuestEntry(client, user, nextQuest);
    return { ...logEntry, quest: nextQuest };
  }
  return undefined;
};
