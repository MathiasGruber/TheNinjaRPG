import { z } from "zod";
import { nanoid } from "nanoid";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "@/api/trpc";
import { secondsFromNow } from "@/utils/time";
import { eq, inArray, lte, isNotNull, isNull, and, sql, asc, gte } from "drizzle-orm";
import { item, jutsu } from "@/drizzle/schema";
import { userJutsu, userItem, userData } from "@/drizzle/schema";
import { quest, questHistory, actionLog } from "@/drizzle/schema";
import { QuestValidator } from "@/validators/objectives";
import { fetchUser, fetchRegeneratedUser } from "@/routers/profile";
import { canChangeContent } from "@/utils/permissions";
import { callDiscordContent } from "@/libs/discord";
import { QuestTypes } from "@/drizzle/constants";
import HumanDiff from "human-object-diff";
import { initiateBattle, determineCombatBackground } from "@/routers/combat";
import { allObjectiveTasks } from "@/validators/objectives";
import { availableRanks, availableRoles } from "@/libs/train";
import { getNewTrackers, getReward } from "@/libs/quest";
import { getActiveObjectives } from "@/libs/quest";
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
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const results = await ctx.drizzle.query.quest.findMany({
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
            : [])
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
  getQuestHistory: protectedProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(500),
      })
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
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const entry = await fetchQuest(ctx.drizzle, input.id);
      if (entry && canChangeContent(user.role)) {
        // Calculate diff
        const diff = new HumanDiff({ objectName: "item" }).diff(entry, {
          id: entry.id,
          expiresAt: entry.expiresAt,
          createdAt: entry.createdAt,
          ...input.data,
        });
        // Prepare data for insertion into database
        const data = input.data;
        data.content.objectives = data.content.objectives.map((objective) => {
          if (objective.task === "defeat_opponents") {
          }
          return objective;
        });
        // Check if quest is changed to be an event
        if (entry.questType !== "event" && input.data.questType === "event") {
          const roles = availableRoles(input.data.requiredRank);
          const users = await ctx.drizzle.query.userData.findMany({
            columns: { userId: true },
            where: and(
              inArray(userData.rank, roles),
              gte(userData.updatedAt, secondsFromNow(-60 * 60 * 24 * 7))
            ),
          });
          await ctx.drizzle.insert(questHistory).values(
            users.map((user) => ({
              id: nanoid(),
              userId: user.userId,
              questId: input.id,
              questType: "event" as const,
            }))
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
        name: "Placeholder",
        image: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        description: "",
        timeFrame: "all_time",
        questType: "mission",
        hidden: 1,
        content: {
          objectives: [],
          reward: {
            reward_money: 0,
            reward_jutsus: [],
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
      const u = await fetchRegeneratedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!u) {
        throw serverError("PRECONDITION_FAILED", "User does not exist");
      }
      // Figure out if any finished quests & get rewards
      const { rewards, quest, done } = getReward(u, input.questId);
      if (!done) return { rewards, quest };
      // Update user quest data
      u.userQuests = u.userQuests.filter((q) => q.questId !== input.questId);
      const { trackers } = getNewTrackers(u, [{ task: "any" }]);
      u.questData = trackers;
      // Fetch names from the database
      console.log(rewards);
      const [items, jutsus] = await Promise.all([
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
                and(inArray(jutsu.id, rewards.reward_jutsus), isNull(userJutsu.userId))
              )
          : [],
      ]);
      // New tier quest
      const questTier = u.userQuests?.find((q) => q.quest.questType === "tier");
      if (!questTier) {
        await insertNextQuest(ctx.drizzle, u, "tier");
      }
      // Update database
      await Promise.all([
        // Update userdata
        ctx.drizzle
          .update(userData)
          .set({
            questData: u.questData,
            money: u.money + rewards.reward_money,
            rank: rewards.reward_rank !== "NONE" ? rewards.reward_rank : u.rank,
          })
          .where(eq(userData.userId, ctx.userId)),
        // Update quest history
        ctx.drizzle
          .update(questHistory)
          .set({ completed: 1, endAt: new Date() })
          .where(
            and(
              eq(questHistory.questId, input.questId),
              eq(questHistory.userId, ctx.userId)
            )
          ),
        // Insert items & jutsus
        ...[
          jutsus.length > 0 &&
            ctx.drizzle.insert(userJutsu).values(
              jutsus.map(({ id }) => ({
                id: nanoid(),
                userId: ctx.userId,
                jutsuId: id,
              }))
            ),
        ],
        ...[
          items.length > 0 &&
            ctx.drizzle.insert(userItem).values(
              items.map(({ id }) => ({
                id: nanoid(),
                userId: ctx.userId,
                itemId: id,
              }))
            ),
        ],
      ]);
      // Update rewards for readability
      rewards.reward_items = items.map((i) => i.name);
      rewards.reward_jutsus = jutsus.map((i) => i.name);
      return { rewards, quest };
    }),
  checkLocationQuest: protectedProcedure
    .output(z.object({ success: z.boolean(), notifications: z.array(z.string()) }))
    .mutation(async ({ ctx }) => {
      const user = await fetchRegeneratedUser({
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
              opponent = { type: "combat", id: randomOpponent };
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
            })
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
                  },
                  "ARENA",
                  determineCombatBackground("ground")
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
  type: QuestType
) => {
  const availableLetters = availableRanks(user.rank);
  const history = await client
    .select()
    .from(quest)
    .leftJoin(
      questHistory,
      and(eq(quest.id, questHistory.questId), eq(questHistory.userId, user.userId))
    )
    .where(
      and(
        eq(quest.questType, type),
        lte(quest.requiredLevel, user.level),
        inArray(quest.requiredRank, availableLetters),
        isNull(questHistory.completed)
      )
    )
    .orderBy((table) => [asc(table.Quest.requiredLevel), asc(table.Quest.tierLevel)]);
  return history.map((quest) => quest.Quest);
};

export const insertQuestEntry = async (
  client: DrizzleClient,
  user: UserData,
  quest: Quest
) => {
  const logEntry = {
    id: nanoid(),
    userId: user.userId,
    questId: quest.id,
    questType: quest.questType,
    startedAt: new Date(),
    endAt: null,
    completed: 0,
  };
  await client.insert(questHistory).values(logEntry);
  return logEntry;
};

export const insertNextQuest = async (
  client: DrizzleClient,
  user: UserData,
  type: QuestType
) => {
  const history = await fetchUncompletedQuests(client, user, type);
  const nextQuest = history?.[0];
  if (nextQuest) {
    const logEntry = await insertQuestEntry(client, user, nextQuest);
    return { ...logEntry, quest: nextQuest };
  }
  return undefined;
};

export const getRandomDaily = async (client: DrizzleClient, user: UserData) => {
  const ranks = availableRanks(user.rank);
  const newDaily = await client.query.quest.findFirst({
    where: and(
      eq(quest.questType, "daily"),
      lte(quest.requiredLevel, user.level),
      isNotNull(quest.content),
      inArray(quest.requiredRank, ranks)
    ),
    orderBy: sql`RAND()`,
  });
  return newDaily ?? null;
};
