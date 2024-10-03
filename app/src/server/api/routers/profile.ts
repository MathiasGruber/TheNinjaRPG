import { z } from "zod";
import { nanoid } from "nanoid";
import { count, eq, ne, sql, gte, and, or, like, asc, desc, isNull } from "drizzle-orm";
import { inArray, notInArray } from "drizzle-orm";
import { secondsPassed, secondsFromNow, getTimeOfLastReset } from "@/utils/time";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import {
  actionLog,
  bankTransfers,
  bloodlineRolls,
  conversationComment,
  forumPost,
  gameSetting,
  historicalAvatar,
  item,
  jutsu,
  jutsuLoadout,
  notification,
  quest,
  questHistory,
  reportLog,
  userBlackList,
  user2conversation,
  userAttribute,
  userData,
  userItem,
  userJutsu,
  userNindo,
  userRequest,
  userReport,
  userReportComment,
  village,
  battleHistory,
} from "@/drizzle/schema";
import { canSeeSecretData } from "@/utils/permissions";
import { usernameSchema } from "@/validators/register";
import { insertNextQuest } from "@/routers/quests";
import { fetchClan, removeFromClan } from "@/routers/clan";
import { getNewTrackers } from "@/libs/quest";
import { mockAchievementHistoryEntries } from "@/libs/quest";
import { mutateContentSchema } from "@/validators/comments";
import { attributes } from "@/validators/register";
import { colors, skin_colors } from "@/validators/register";
import { callDiscordContent } from "@/libs/discord";
import { scaleUserStats } from "@/libs/profile";
import { insertUserDataSchema } from "@/drizzle/schema";
import { canChangeContent } from "@/utils/permissions";
import { calcLevelRequirements } from "@/libs/profile";
import { activityStreakRewards } from "@/libs/profile";
import { calcHP, calcSP, calcCP } from "@/libs/profile";
import { COST_CHANGE_USERNAME } from "@/drizzle/constants";
import { MAX_ATTRIBUTES } from "@/drizzle/constants";
import { createStatSchema } from "@/libs/combat/types";
import {
  getGameSettingBoost,
  getGameSetting,
  updateGameSetting,
} from "@/libs/gamesettings";
import { updateUserSchema } from "@/validators/user";
import { canChangeUserRole } from "@/utils/permissions";
import { UserRanks, BasicElementName } from "@/drizzle/constants";
import { getRandomElement } from "@/utils/array";
import { setEmptyStringsToNulls } from "@/utils/typeutils";
import { capUserStats } from "@/libs/profile";
import { deduceActiveUserRegen } from "@/libs/profile";
import { getServerPusher } from "@/libs/pusher";
import { RYO_CAP } from "@/drizzle/constants";
import { USER_CAPS } from "@/drizzle/constants";
import { getReducedGainsDays } from "@/libs/train";
import { calculateContentDiff } from "@/utils/diff";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { getPublicUsersSchema } from "@/validators/user";
import type { GetPublicUsersSchema } from "@/validators/user";
import type { UserJutsu, Jutsu, UserItem, Item } from "@/drizzle/schema";
import type { UserData, Bloodline } from "@/drizzle/schema";
import type { Village, VillageAlliance, VillageStructure } from "@/drizzle/schema";
import type { UserQuest, Clan } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import type { NavBarDropdownLink } from "@/libs/menus";
import type { ExecutedQuery } from "@planetscale/database";

const pusher = getServerPusher();

export const profileRouter = createTRPCRouter({
  // Get user blacklist
  getBlacklist: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.userBlackList.findMany({
      where: eq(userBlackList.creatorUserId, ctx.userId),
      with: {
        target: { columns: { username: true, userId: true, avatar: true } },
      },
    });
  }),
  toggleBlacklistEntry: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [entry, target] = await Promise.all([
        ctx.drizzle.query.userBlackList.findFirst({
          where: and(
            eq(userBlackList.creatorUserId, ctx.userId),
            eq(userBlackList.targetUserId, input.userId),
          ),
        }),
        fetchUser(ctx.drizzle, input.userId),
      ]);
      // Guard
      if (!target) return errorResponse("User not found");
      if (ctx.userId === input.userId) return errorResponse("Not yourself");
      // Derived
      const targetName = target.username;
      // Mutate
      if (!entry) {
        const result = await ctx.drizzle.insert(userBlackList).values({
          creatorUserId: ctx.userId,
          targetUserId: input.userId,
        });
        if (result.rowsAffected === 0) {
          return { success: false, message: `Failed to add ${targetName}` };
        } else {
          return { success: true, message: `Added ${targetName} to blacklist` };
        }
      } else {
        await ctx.drizzle.delete(userBlackList).where(eq(userBlackList.id, entry.id));
        return { success: true, message: `Removed ${targetName} from blacklist` };
      }
    }),
  // Get all AI names
  getAllAiNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.userData.findMany({
      where: and(eq(userData.isAi, true), ne(userData.rank, "ELDER")),
      columns: {
        userId: true,
        username: true,
        level: true,
        avatar: true,
        isSummon: true,
        inArena: true,
      },
      orderBy: asc(userData.level),
    });
  }),
  // Update user with new level
  levelUp: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    // Query
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });
    // Guard
    if (!user) return errorResponse("User not found");
    const expRequired = calcLevelRequirements(user.level) - user.experience;
    const lvlCap = USER_CAPS[user.rank].LVL_CAP;
    if (user.level >= lvlCap) return errorResponse("User at max level for this rank!");
    if (expRequired > 0) return errorResponse("No enough experience for level");
    // Mutate
    const newLevel = user.level + 1;
    const { trackers } = getNewTrackers(user, [
      { task: "user_level", value: newLevel },
    ]);
    const result = await ctx.drizzle
      .update(userData)
      .set({
        level: newLevel,
        maxHealth: calcHP(newLevel),
        maxStamina: calcSP(newLevel),
        maxChakra: calcCP(newLevel),
        questData: trackers,
      })
      .where(and(eq(userData.userId, ctx.userId), eq(userData.level, user.level)));
    if (result.rowsAffected > 0 && user.recruiterId) {
      const amount = newLevel * 10;
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ bank: sql`${userData.bank} + ${amount}` })
          .where(eq(userData.userId, user.recruiterId)),
        ctx.drizzle.insert(bankTransfers).values({
          senderId: ctx.userId,
          receiverId: user.recruiterId,
          amount: amount,
          type: "recruiter",
        }),
      ]);
    }
    // Return response
    if (result.rowsAffected === 0) return errorResponse("Could not update level");
    return { success: true, message: `User leveled up to ${newLevel}` };
  }),
  // Get all information on logged in user
  getUser: protectedProcedure
    .input(z.object({ token: z.string().optional().nullable() }))
    .query(async ({ ctx }) => {
      // Query
      const { user, settings, rewards } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        userIp: ctx.userIp,
        // forceRegen: true, // This should be disabled in prod to save on DB calls
      });
      // Figure out notifications
      const notifications: NavBarDropdownLink[] = [];
      if (rewards) {
        if (rewards.money > 0) {
          notifications.push({
            href: "/profile",
            name: `Activity streak reward: ${rewards.money} ryo`,
            color: "toast",
          });
        }
        if (rewards.reputationPoints > 0) {
          notifications.push({
            href: "/profile",
            name: `Activity streak reward: ${rewards.reputationPoints} reputation points`,
            color: "toast",
          });
        }
      }
      // Settings
      const trainingBoost = getGameSettingBoost("trainingGainMultiplier", settings);
      if (trainingBoost) {
        notifications.push({
          href: "/traininggrounds",
          name: `${trainingBoost.value}X gains | ${trainingBoost.daysLeft} days`,
          color: "green",
        });
      }
      const regenBoost = getGameSettingBoost("regenGainMultiplier", settings);
      if (regenBoost) {
        notifications.push({
          href: "/profile",
          name: `${regenBoost.value}X regen | ${regenBoost.daysLeft} days`,
          color: "green",
        });
      }
      // User specific
      if (user) {
        // Get number of un-resolved user reports
        if (user.role === "MODERATOR" || user.role === "ADMIN") {
          const reportCounts = await ctx.drizzle
            .select({ count: sql<number>`count(*)`.mapWith(Number) })
            .from(userReport)
            .where(inArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"]));
          const userReports = reportCounts?.[0]?.count || 0;
          if (userReports > 0) {
            notifications.push({
              href: "/reports",
              name: `${userReports} waiting!`,
              color: "blue",
            });
          }
        }
        // Check if user is banned
        if (user.isBanned) {
          notifications.push({
            href: "/reports",
            name: "Banned!",
            color: "red",
          });
        }
        // Unused experience points
        if (user.earnedExperience > 0) {
          notifications.push({
            href: "/profile/experience",
            name: `Earned exp: ${user.earnedExperience}`,
            color: "blue",
          });
        }
        // Check if reduced gains
        const reducedDays = getReducedGainsDays(user);
        if (reducedDays > 0) {
          notifications.push({
            href: "/village",
            name: `Slowed ${Math.ceil(reducedDays)} days`,
            color: "red",
          });
        }
        // Add deletion timer to notifications
        if (user?.deletionAt) {
          notifications?.push({
            href: "/profile",
            name: "Being deleted",
            color: "red",
          });
        }
        // Is in combat
        if (user.status === "BATTLE") {
          notifications?.push({
            href: "/combat",
            name: "In combat",
            color: "red",
          });
        }
        // Is in hospital
        if (user.status === "HOSPITALIZED") {
          notifications?.push({
            href: "/hospital",
            name: "In hospital",
            color: "red",
          });
        }
        // Stuff in inbox
        if (user.inboxNews > 0) {
          notifications?.push({
            href: "/inbox",
            name: `${user.inboxNews} new messages`,
            color: "green",
          });
        }
        // Stuff in news
        if (user.unreadNews > 0) {
          notifications?.push({
            href: "/news",
            name: `${user.unreadNews} new news`,
            color: "green",
          });
        }
        if (user.unreadNotifications > 0) {
          const [unread] = await Promise.all([
            ctx.drizzle.query.notification.findMany({
              limit: user.unreadNotifications,
              orderBy: desc(notification.createdAt),
            }),
            ctx.drizzle
              .update(userData)
              .set({ unreadNotifications: 0 })
              .where(eq(userData.userId, ctx.userId)),
          ]);
          unread?.forEach((n) => {
            notifications?.push({
              href: "/news",
              name: n.content,
              color: "toast",
            });
          });
        }
      }
      return { userData: user, notifications: notifications, serverTime: Date.now() };
    }),
  // Get an AI
  getAi: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: and(eq(userData.userId, input.userId), eq(userData.isAi, true)),
        with: { jutsus: { with: { jutsu: true } }, items: { with: { item: true } } },
      });
      if (!user) {
        throw serverError("NOT_FOUND", "AI not found");
      }
      return user;
    }),
  // Create new AI
  create: protectedProcedure.output(baseServerResponse).mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (canChangeContent(user.role)) {
      const id = nanoid();
      await ctx.drizzle.insert(userData).values({
        userId: id,
        username: `New AI - ${id}`,
        gender: "Unknown",
        avatar: IMG_AVATAR_DEFAULT,
        villageId: null,
        approvedTos: 1,
        sector: 0,
        level: 100,
        isAi: true,
      });
      return { success: true, message: id };
    } else {
      return { success: false, message: `Not allowed to create AI` };
    }
  }),
  // Delete a AI
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const ai = await fetchUser(ctx.drizzle, input.id);
      if (ai && ai.isAi && canChangeContent(user.role)) {
        await deleteUser(ctx.drizzle, ai.userId);
        return { success: true, message: `AI deleted` };
      } else {
        return { success: false, message: `Not allowed to delete AI` };
      }
    }),
  // Update user
  updateUser: protectedProcedure
    .input(z.object({ id: z.string(), data: updateUserSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Queries
      const [user, target] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, input.id),
          with: { jutsus: true, items: true },
        }),
      ]);
      // Guards
      const availableRoles = canChangeUserRole(user.role);
      if (!target) return errorResponse("User not found");
      if (!availableRoles) return errorResponse("Not allowed");
      if (!availableRoles.includes(target.role)) {
        return errorResponse(`Not allowed to change: ${target.role}`);
      }
      if (!availableRoles.includes(input.data.role)) {
        return errorResponse(`Only available roles: ${availableRoles.join(", ")}`);
      }
      // Update jutsus & items
      const { jutsuChanges, itemChanges } = await updateUserContent({
        client: ctx.drizzle,
        userId: target.userId,
        oldJutsuIds: target.jutsus.map((j) => j.jutsuId),
        newJutsuIds: input.data.jutsus ?? [],
        oldItemIds: target.items.map((j) => j.itemId),
        newItemIds: input.data.items ?? [],
      });
      // Calculate diff
      delete input.data.jutsus;
      delete input.data.items;
      const diff = calculateContentDiff(
        Object.fromEntries(
          Object.entries(target).filter(([k]) => Object.keys(input.data).includes(k)),
        ),
        input.data,
      )
        .concat(jutsuChanges)
        .concat(itemChanges);
      // Update database
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set(input.data)
          .where(eq(userData.userId, target.userId)),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: diff,
          relatedId: target.userId,
          relatedMsg: `Update: ${target.username}`,
          relatedImage: target.avatar,
        }),
      ]);
      return { success: true, message: `Data updated: ${diff.join(". ")}` };
    }),
  // Update a AI
  updateAi: protectedProcedure
    .input(z.object({ id: z.string(), data: insertUserDataSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Set empty strings to null
      setEmptyStringsToNulls(input.data);
      input.data.customTitle = input.data.customTitle || "";

      // Queries
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const ai = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, input.id),
        with: { jutsus: true, items: true },
      });

      // Guards
      if (!ai) return errorResponse("AI not found");
      if (!ai.isAi) return errorResponse("Not an AI");
      if (!canChangeContent(user.role)) return errorResponse("Not allowed");

      // Update jutsus & items
      const { jutsuChanges, itemChanges } = await updateUserContent({
        client: ctx.drizzle,
        userId: ai.userId,
        oldJutsuIds: ai.jutsus.map((j) => j.jutsuId),
        newJutsuIds: input.data.jutsus ?? [],
        oldItemIds: ai.items.map((j) => j.itemId),
        newItemIds: input.data.items ?? [],
      });
      delete input.data.jutsus;
      delete input.data.items;

      // Update input data based on level
      const newAi = { ...ai, ...input.data } as UserData;

      // Level-based stats / pools
      scaleUserStats(newAi);

      // Calculate diff
      const diff = calculateContentDiff(
        Object.fromEntries(
          Object.entries(ai).filter(([k]) => Object.keys(input.data).includes(k)),
        ),
        Object.fromEntries(
          Object.entries(newAi).filter(([k]) => Object.keys(input.data).includes(k)),
        ),
      )
        .concat(jutsuChanges)
        .concat(itemChanges);

      // Update database
      await Promise.all([
        ctx.drizzle.update(userData).set(newAi).where(eq(userData.userId, input.id)),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "ai",
          changes: diff,
          relatedId: ai.userId,
          relatedMsg: `Update: ${ai.username}`,
          relatedImage: ai.avatar,
        }),
      ]);

      // Update discord channel
      if (process.env.NODE_ENV !== "development") {
        await callDiscordContent(user.username, ai.username, diff, ai.avatar);
      }
      return { success: true, message: `Data updated: ${diff.join(". ")}` };
    }),
  // Get user attributes
  getUserAttributes: protectedProcedure.query(async ({ ctx }) => {
    return fetchAttributes(ctx.drizzle, ctx.userId);
  }),
  // Check if username exists in database already
  getUsername: publicProcedure
    .input(
      z.object({
        username: z.string().trim(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const username = await ctx.drizzle.query.userData.findFirst({
        columns: { username: true },
        where: eq(userData.username, input.username),
      });
      if (username) return username;
      return null;
    }),
  // Update username
  updateUsername: protectedProcedure
    .input(z.object({ username: usernameSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const [user, target] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userData.findFirst({
          columns: { username: true },
          where: eq(userData.username, input.username),
        }),
      ]);
      // Guard
      if (user.username === input.username) {
        return errorResponse("Username is the same");
      }
      if (user.reputationPoints < COST_CHANGE_USERNAME) {
        return errorResponse("Not enough reputation points");
      }
      if (user.isBanned) return errorResponse("You are banned");
      if (target) return errorResponse("Username already taken");
      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({
          username: input.username,
          reputationPoints: sql`reputationPoints - ${COST_CHANGE_USERNAME}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`Username changed from ${user.username} to ${input.username}`],
          relatedId: ctx.userId,
          relatedMsg: `Update: ${user.username} -> ${input.username}`,
          relatedImage: user.avatar,
        });
        return { success: true, message: "Username updated" };
      }
    }),
  // Use earned experience points for stats
  useUnusedExperiencePoints: protectedProcedure
    .input(createStatSchema(0, 0))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Derived
      const inputSum = Object.values(input).reduce(
        (a, b) => Math.floor(a) + Math.floor(b),
        0,
      );
      // Guard
      if (inputSum <= 0) return errorResponse("No stats to assign");
      if (user.earnedExperience <= 0) return errorResponse("No experience left");
      if (inputSum > user.earnedExperience) {
        return errorResponse("Trying to assign more stats than available");
      }
      // Mutate & cap
      user.ninjutsuOffence += Math.floor(input.ninjutsuOffence);
      user.taijutsuOffence += Math.floor(input.taijutsuOffence);
      user.genjutsuOffence += Math.floor(input.genjutsuOffence);
      user.bukijutsuOffence += Math.floor(input.bukijutsuOffence);
      user.ninjutsuDefence += Math.floor(input.ninjutsuDefence);
      user.taijutsuDefence += Math.floor(input.taijutsuDefence);
      user.genjutsuDefence += Math.floor(input.genjutsuDefence);
      user.bukijutsuDefence += Math.floor(input.bukijutsuDefence);
      user.strength += Math.floor(input.strength);
      user.speed += Math.floor(input.speed);
      user.intelligence += Math.floor(input.intelligence);
      user.willpower += Math.floor(input.willpower);
      capUserStats(user);
      // Update
      const result = await ctx.drizzle
        .update(userData)
        .set({
          ninjutsuOffence: user.ninjutsuOffence,
          taijutsuOffence: user.taijutsuOffence,
          genjutsuOffence: user.genjutsuOffence,
          bukijutsuOffence: user.bukijutsuOffence,
          ninjutsuDefence: user.ninjutsuDefence,
          taijutsuDefence: user.taijutsuDefence,
          genjutsuDefence: user.genjutsuDefence,
          bukijutsuDefence: user.bukijutsuDefence,
          strength: user.strength,
          speed: user.speed,
          intelligence: user.intelligence,
          willpower: user.willpower,
          experience: sql`experience + ${inputSum}`,
          earnedExperience: sql`earnedExperience - ${inputSum}`,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            gte(userData.earnedExperience, inputSum),
          ),
        );
      if (result.rowsAffected === 0) {
        return errorResponse("Could not update user");
      } else {
        return { success: true, message: "User stats updated" };
      }
    }),
  // Get nindo text of user
  getNindo: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const nindo = await ctx.drizzle.query.userNindo.findFirst({
        where: eq(userNindo.userId, input.userId),
      });
      return nindo ? nindo.content : "";
    }),
  // Update nindo
  updateNindo: protectedProcedure
    .input(mutateContentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      // Guard
      if (user.isBanned) return errorResponse("You are banned");
      if (user.isSilenced) return errorResponse("You are silenced");
      // Mutate
      return updateNindo(ctx.drizzle, ctx.userId, input.content);
    }),
  // Insert attribute
  insertAttribute: protectedProcedure
    .input(
      z.object({
        attribute: z.enum([...attributes, "Hair", "Skin", "Eyes"]),
        color: z.enum([...colors, ...skin_colors]).optional(),
      }),
    )
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const attributes = await fetchAttributes(ctx.drizzle, ctx.userId);
      if (attributes.length >= MAX_ATTRIBUTES) {
        return { success: false, message: `Only ${MAX_ATTRIBUTES} attributes allowed` };
      }
      const name =
        ["Hair", "Skin", "Eyes"].includes(input.attribute) && input.color
          ? `${input.color} ${input.attribute}`
          : input.attribute;
      const result = await ctx.drizzle.insert(userAttribute).values({
        id: nanoid(),
        userId: ctx.userId,
        attribute: name,
      });
      if (result.rowsAffected === 0) {
        return { success: false, message: "Failed to insert attribute" };
      } else {
        return { success: true, message: "Attribute inserted" };
      }
    }),
  // Delete attribute
  deleteAttribute: protectedProcedure
    .input(z.object({ attribute: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.drizzle
        .delete(userAttribute)
        .where(
          and(
            eq(userAttribute.attribute, input.attribute),
            eq(userAttribute.userId, ctx.userId),
          ),
        );
      if (result.rowsAffected === 0) {
        return { success: false, message: "Failed to delete attribute" };
      } else {
        return { success: true, message: "Attribute deleted" };
      }
    }),
  // Return list of 5 most similar users in database
  searchUsers: protectedProcedure
    .input(
      z.object({
        username: z.string().trim(),
        showYourself: z.boolean(),
        showAi: z.boolean(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.userData.findMany({
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          isOutlaw: true,
          level: true,
          role: true,
          federalStatus: true,
          isAi: true,
        },
        where: and(
          like(userData.username, `%${input.username}%`),
          eq(userData.approvedTos, 1),
          ...(input.showAi ? [] : [eq(userData.isAi, false)]),
          ...(input.showYourself ? [] : [sql`${userData.userId} != ${ctx.userId}`]),
        ),
        orderBy: [sql`LENGTH(${userData.username}) asc`],
        limit: 5,
      });
    }),
  getUserDailyPveBattleCount: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      //Query
      const result = ctx.drizzle.query.battleHistory.findMany({
        where: and(
          eq(battleHistory.attackedId, input.userId),
          notInArray(battleHistory.battleType, ["SPARRING", "COMBAT"]),
          gte(battleHistory.createdAt, getTimeOfLastReset()),
        ),
      });
      return (await result).length;
    }),
  // Get public information on a user
  getPublicUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [requester, user] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userData.findFirst({
          where: and(eq(userData.userId, input.userId)),
          columns: {
            avatar: true,
            bloodlineId: true,
            curChakra: true,
            curHealth: true,
            curStamina: true,
            customTitle: true,
            experience: true,
            earnedExperience: true,
            federalStatus: true,
            gender: true,
            isAi: true,
            isOutlaw: true,
            level: true,
            maxChakra: true,
            maxHealth: true,
            maxStamina: true,
            movedTooFastCount: true,
            rank: true,
            reputationPoints: true,
            role: true,
            lastIp: true,
            senseiId: true,
            status: true,
            userId: true,
            username: true,
            pveFights: true,
            deletionAt: true,
          },
          with: {
            village: true,
            bloodline: true,
            nindo: true,
            clan: true,
            jutsus: { columns: { jutsuId: true } },
            items: { columns: { itemId: true } },
            badges: { with: { badge: true } },
            recruitedUsers: {
              columns: {
                userId: true,
                username: true,
                level: true,
                rank: true,
                isOutlaw: true,
                avatar: true,
              },
            },
            students: {
              columns: {
                userId: true,
                username: true,
                level: true,
                rank: true,
                isOutlaw: true,
                avatar: true,
              },
            },
            sensei: {
              columns: {
                userId: true,
                username: true,
              },
            },
            anbuSquad: {
              columns: { name: true },
            },
          },
        }),
      ]);
      // Guard
      if (!user) return null;
      // Hide secrets
      if (!canSeeSecretData(requester.role)) {
        user.earnedExperience = 8008;
        user.lastIp = "hidden";
      }
      // Return
      return {
        ...user,
        jutsus: user?.jutsus.map((j) => j.jutsuId),
        items: user?.items.map((i) => i.itemId),
      };
    }),
  countOnlineUsers: protectedProcedure.query(async ({ ctx }) => {
    // Fetch
    const [current, daily, maxOnline] = await Promise.all([
      ctx.drizzle
        .select({ count: count() })
        .from(userData)
        .where(gte(userData.updatedAt, secondsFromNow(-300))),
      ctx.drizzle
        .select({ count: count() })
        .from(userData)
        .where(gte(userData.updatedAt, secondsFromNow(-3600 * 24))),
      getGameSetting(ctx.drizzle, "onlineUsers"),
    ]);
    // Derived
    const onlineNow = current?.[0]?.count ?? 0;
    const onlineDay = daily?.[0]?.count ?? 0;
    const newMax = maxOnline.value < onlineNow;
    if (newMax) {
      await updateGameSetting(ctx.drizzle, "onlineUsers", onlineNow, new Date());
    }
    // Return
    return { onlineNow, onlineDay, maxOnline: newMax ? onlineNow : maxOnline.value };
  }),
  // Get public users
  getPublicUsers: publicProcedure
    .input(getPublicUsersSchema)
    .query(async ({ ctx, input }) => {
      return fetchPublicUsers(ctx.drizzle, input, ctx.userId);
    }),
  // Toggle deletion of user
  toggleDeletionTimer: protectedProcedure.mutation(async ({ ctx }) => {
    const currentUser = await fetchUser(ctx.drizzle, ctx.userId);
    return ctx.drizzle
      .update(userData)
      .set({
        deletionAt: currentUser.deletionAt
          ? null
          : new Date(new Date().getTime() + 2 * 86400000),
      })
      .where(eq(userData.userId, ctx.userId));
  }),
  // Delete user
  confirmDeletion: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    if (!user.deletionAt || user.deletionAt > new Date()) {
      throw serverError("PRECONDITION_FAILED", "Deletion timer not passed yet");
    }
    if (user.isBanned || user.isSilenced) {
      throw serverError("PRECONDITION_FAILED", "You have to serve your ban first");
    }
    await deleteUser(ctx.drizzle, ctx.userId);
  }),
  // Copy user setting to Terriator - exclusive to Terriator user for debugging
  cloneUserForDebug: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const target = await fetchUser(ctx.drizzle, input.userId);
      if (!user || !target) {
        return { success: false, message: "User not found" };
      }
      if (user.username !== "Terriator") {
        return { success: false, message: "You are not Terriator" };
      }
      if (target.username === "Terriator") {
        return { success: false, message: "Cannot copy Terriator to Terriator" };
      }
      const [targetJutsus, targetItems] = await Promise.all([
        ctx.drizzle.query.userJutsu.findMany({
          where: eq(userJutsu.userId, input.userId),
        }),
        ctx.drizzle.query.userItem.findMany({
          where: eq(userItem.userId, input.userId),
        }),
      ]);
      await Promise.all([
        ctx.drizzle.delete(userJutsu).where(eq(userJutsu.userId, user.userId)),
        ctx.drizzle.delete(userItem).where(eq(userItem.userId, user.userId)),
        ctx.drizzle
          .update(userData)
          .set({
            curHealth: target.curHealth,
            maxHealth: target.maxHealth,
            curStamina: target.curStamina,
            maxStamina: target.maxStamina,
            curChakra: target.curChakra,
            maxChakra: target.maxChakra,
            money: target.money,
            bank: target.bank,
            experience: target.experience,
            rank: target.rank,
            level: target.level,
            villageId: target.villageId,
            bloodlineId: target.bloodlineId,
            strength: target.strength,
            speed: target.speed,
            intelligence: target.intelligence,
            willpower: target.willpower,
            ninjutsuOffence: target.ninjutsuOffence,
            ninjutsuDefence: target.ninjutsuDefence,
            genjutsuOffence: target.genjutsuOffence,
            genjutsuDefence: target.genjutsuDefence,
            taijutsuOffence: target.taijutsuOffence,
            taijutsuDefence: target.taijutsuDefence,
            bukijutsuOffence: target.bukijutsuOffence,
            bukijutsuDefence: target.bukijutsuDefence,
            questData: target.questData,
            sector: target.sector,
            latitude: target.latitude,
            longitude: target.longitude,
          })
          .where(eq(userData.userId, ctx.userId)),
      ]);
      if (targetJutsus.length > 0) {
        await ctx.drizzle.insert(userJutsu).values(
          targetJutsus.map((userjutsu) => ({
            ...userjutsu,
            userId: ctx.userId,
            id: nanoid(),
          })),
        );
      }
      if (targetItems.length > 0) {
        await ctx.drizzle.insert(userItem).values(
          targetItems.map((useritem) => ({
            ...useritem,
            userId: ctx.userId,
            id: nanoid(),
          })),
        );
      }
      return { success: true, message: "User copied" };
    }),
});

export const updateNindo = async (
  client: DrizzleClient,
  userId: string,
  content: string,
) => {
  const nindo = await client.query.userNindo.findFirst({
    where: eq(userNindo.userId, userId),
  });
  let result: ExecutedQuery;
  if (!nindo) {
    result = await client.insert(userNindo).values({
      id: nanoid(),
      userId: userId,
      content: content,
    });
  } else {
    result = await client
      .update(userNindo)
      .set({ content: content })
      .where(eq(userNindo.userId, userId));
  }
  if (result.rowsAffected === 0) {
    return { success: false, message: "Could not update content" };
  } else {
    return { success: true, message: "Content updated" };
  }
};

export const deleteUser = async (client: DrizzleClient, userId: string) => {
  await client.transaction(async (tx) => {
    await tx.delete(actionLog).where(eq(actionLog.userId, userId));
    await tx.delete(bankTransfers).where(eq(bankTransfers.senderId, userId));
    await tx.delete(bankTransfers).where(eq(bankTransfers.receiverId, userId));
    await tx.delete(bloodlineRolls).where(eq(bloodlineRolls.userId, userId));
    await tx.delete(conversationComment).where(eq(conversationComment.userId, userId));
    await tx.delete(forumPost).where(eq(forumPost.userId, userId));
    await tx.delete(historicalAvatar).where(eq(historicalAvatar.userId, userId));
    await tx.delete(jutsuLoadout).where(eq(jutsuLoadout.userId, userId));
    await tx.delete(questHistory).where(eq(questHistory.userId, userId));
    await tx.delete(user2conversation).where(eq(user2conversation.userId, userId));
    await tx.delete(userAttribute).where(eq(userAttribute.userId, userId));
    await tx.delete(userData).where(eq(userData.userId, userId));
    await tx.delete(userItem).where(eq(userItem.userId, userId));
    await tx.delete(userJutsu).where(eq(userJutsu.userId, userId));
    await tx.delete(userNindo).where(eq(userNindo.userId, userId));
    await tx.delete(userRequest).where(eq(userRequest.senderId, userId));
    await tx.delete(userRequest).where(eq(userRequest.receiverId, userId));
    await tx.delete(userReportComment).where(eq(userReportComment.userId, userId));
    await tx
      .delete(reportLog)
      .where(or(eq(reportLog.targetUserId, userId), eq(reportLog.staffUserId, userId)));
  });
  await Promise.all([
    client
      .update(userData)
      .set({ senseiId: null })
      .where(eq(userData.senseiId, userId)),
  ]);
};

export const fetchUser = async (client: DrizzleClient, userId: string) => {
  const user = await client.query.userData.findFirst({
    where: eq(userData.userId, userId),
  });
  if (!user) {
    throw new Error(`fetchUser: User not found: ${userId}`);
  }
  return user;
};

export const updateUserContent = async (props: {
  client: DrizzleClient;
  userId: string;
  oldJutsuIds: string[];
  newJutsuIds: string[];
  oldItemIds: string[];
  newItemIds: string[];
}) => {
  // Destructure
  const { client, userId, oldJutsuIds, newJutsuIds, oldItemIds, newItemIds } = props;

  // Store any new jutsus
  const newJ = oldJutsuIds.sort().join(",") !== newJutsuIds.sort().join(",");
  const newI = oldItemIds.sort().join(",") !== newItemIds.sort().join(",");

  // difference arrays
  let jutsuChanges: string[] = [];
  let itemChanges: string[] = [];

  // If jutsus are different, then update with jutsu names for diff calculation only
  if (newJ || newI) {
    const [jutsuData, itemData] = await Promise.all([
      client.query.jutsu.findMany({
        where: inArray(jutsu.id, oldJutsuIds.concat(newJutsuIds).concat(["non-empty"])),
        columns: { id: true, name: true },
      }),
      client.query.item.findMany({
        where: inArray(item.id, oldItemIds.concat(newItemIds).concat(["non-empty"])),
        columns: { id: true, name: true },
      }),
    ]);
    jutsuChanges = calculateContentDiff(
      { jutsus: oldJutsuIds.map((id) => jutsuData.find((j) => j.id === id)?.name) },
      { jutsus: newJutsuIds.map((id) => jutsuData.find((j) => j.id === id)?.name) },
    );
    itemChanges = calculateContentDiff(
      { items: oldItemIds.map((id) => itemData.find((j) => j.id === id)?.name) },
      { items: newItemIds.map((id) => itemData.find((j) => j.id === id)?.name) },
    );

    // Updated content
    const deletedJ = oldJutsuIds.filter((id) => !newJutsuIds.includes(id));
    const deletedI = oldItemIds.filter((id) => !newItemIds.includes(id));
    const insertedJ = newJutsuIds.filter((id) => !oldJutsuIds.includes(id));
    const insertedI = newItemIds.filter((id) => !oldItemIds.includes(id));

    // Run updates
    await Promise.all([
      ...(deletedJ.length > 0
        ? [
            client
              .delete(userJutsu)
              .where(
                and(eq(userJutsu.userId, userId), inArray(userJutsu.jutsuId, deletedJ)),
              ),
          ]
        : []),
      ...(deletedI.length > 0
        ? [
            client
              .delete(userItem)
              .where(
                and(eq(userItem.userId, userId), inArray(userItem.itemId, deletedI)),
              ),
          ]
        : []),
      ...(insertedJ.length > 0
        ? [
            client.insert(userJutsu).values(
              insertedJ.map((jutsuId) => ({
                id: nanoid(),
                userId: userId,
                jutsuId: jutsuId,
                level: 1,
                equipped: 1,
              })),
            ),
          ]
        : []),
      ...(insertedI.length > 0
        ? [
            client.insert(userItem).values(
              insertedI.map((itemId) => ({
                id: nanoid(),
                userId: userId,
                itemId: itemId,
                equipped: "CHEST" as const,
              })),
            ),
          ]
        : []),
    ]);
  }

  return { jutsuChanges, itemChanges };
};

/**
 * Fetch user with bloodline & village relations. Occasionally updates the user with regeneration
 * of pools, or optionally forces regeneration with forceRegen=true
 */
export const fetchUpdatedUser = async (props: {
  client: DrizzleClient;
  userId: string;
  userIp?: string;
  forceRegen?: boolean;
}) => {
  // Destructure
  const { client, userId, userIp, forceRegen } = props;

  // Ensure we can fetch the user
  const [achievements, settings, user] = await Promise.all([
    client
      .select()
      .from(quest)
      .where(and(eq(quest.questType, "achievement"), eq(quest.hidden, false))),
    client.select().from(gameSetting),
    client.query.userData.findFirst({
      where: eq(userData.userId, userId),
      with: {
        bloodline: true,
        clan: true,
        village: {
          with: {
            structures: true,
            relationshipA: true,
            relationshipB: true,
          },
        },
        anbuSquad: {
          columns: { name: true },
        },
        loadout: {
          columns: { jutsuIds: true },
        },
        userQuests: {
          where: or(
            and(isNull(questHistory.endAt), eq(questHistory.completed, 0)),
            eq(questHistory.questType, "achievement"),
          ),
          with: {
            quest: true,
          },
          orderBy: sql`FIELD(${questHistory.questType}, 'daily', 'tier') ASC`,
        },
      },
    }),
  ]);

  // Add in achievements
  if (user) {
    user.userQuests.push(...mockAchievementHistoryEntries(achievements, user));
    user.userQuests = user.userQuests.filter(
      (q) => !q.quest.hidden || canChangeContent(user.role),
    );
  }

  if (user) {
    // Add bloodline, structure, etc.  regen to regeneration
    user.regeneration = deduceActiveUserRegen(user, settings);
  }

  // Rewards, e.g. for activity streak
  let rewards: ReturnType<typeof activityStreakRewards> | undefined;

  // If more than 5min since last user update, update the user with regen. We do not need this to be synchronous
  // and it is mostly done to keep user updated on the overview pages
  if (user && ["AWAKE", "ASLEEP"].includes(user.status)) {
    const sinceUpdate = secondsPassed(user.updatedAt);
    if (sinceUpdate > 300 || forceRegen || user.villagePrestige < 0) {
      const regen = (user.regeneration * secondsPassed(user.regenAt)) / 60;
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      // Get activity rewards if any & update timers
      const now = new Date();
      const newDay = now.getDate() !== user.updatedAt.getDate();
      const withinThreshold = secondsPassed(user.updatedAt) < 36 * 3600;
      if (newDay) {
        user.activityStreak = withinThreshold ? user.activityStreak + 1 : 1;
        rewards = activityStreakRewards(user.activityStreak);
        if (rewards.money > 0) user.money += rewards.money;
        if (rewards.reputationPoints > 0) {
          user.reputationPoints += rewards.reputationPoints;
          user.reputationPointsTotal += rewards.reputationPoints;
        }
      }
      user.updatedAt = now;
      user.regenAt = now;
      // If prestige below 0, reset to 0 and move to outlaw faction
      if (user.villagePrestige < 0 && user.village?.type === "VILLAGE") {
        const faction = await client.query.village.findFirst({
          where: eq(village.type, "OUTLAW"),
        });
        if (faction) {
          user.villagePrestige = 0;
          user.villageId = faction.id;
          user.isOutlaw = true;
          if (user.clanId) {
            const clanData = await fetchClan(client, user.clanId);
            if (clanData) {
              await removeFromClan(client, clanData, user, ["Turned outlaw"]);
            }
          }
          void pusher.trigger(user.userId, "event", {
            type: "userMessage",
            message: "You have been kicked out of your village due to negative presige",
            route: "/profile",
            routeText: "To Profile",
          });
        }
      }
      // Ensure that we have a tier quest
      let questTier = user.userQuests?.find((q) => q.quest.questType === "tier");
      if (!questTier) {
        questTier = await insertNextQuest(client, user, "tier");
        if (questTier) {
          user.userQuests.push(questTier);
        }
      }
      // Ensure that we have an exam quest
      let questExam = user.userQuests?.find((q) => q.quest.questType === "exam");
      if (!questExam) {
        questExam = await insertNextQuest(client, user, "exam");
        if (questExam) {
          user.userQuests.push(questExam);
        }
      }
      // Ensure that the user has elements
      const rankId = UserRanks.findIndex((r) => r === user.rank);
      if (rankId >= 1 && !user.primaryElement) {
        user.primaryElement = getRandomElement(BasicElementName) ?? null;
      }
      if (rankId >= 2 && !user.secondaryElement) {
        const available = BasicElementName.filter((e) => e !== user.primaryElement);
        user.secondaryElement = getRandomElement(available) ?? null;
      }
      // Update database
      await client
        .update(userData)
        .set({
          curHealth: user.curHealth,
          curStamina: user.curStamina,
          curChakra: user.curChakra,
          updatedAt: user.updatedAt,
          regenAt: user.regenAt,
          questData: user.questData,
          activityStreak: user.activityStreak,
          money: user.money > RYO_CAP ? RYO_CAP : user.money,
          bank: user.bank > RYO_CAP ? RYO_CAP : user.bank,
          primaryElement: user.primaryElement,
          secondaryElement: user.secondaryElement,
          reputationPoints: user.reputationPoints,
          reputationPointsTotal: user.reputationPointsTotal,
          villagePrestige: user.villagePrestige,
          villageId: user.villageId,
          isOutlaw: user.isOutlaw,
          ...(userIp ? { lastIp: userIp } : {}),
        })
        .where(eq(userData.userId, userId));
    }
  }
  if (user) {
    const { trackers } = getNewTrackers(user, [{ task: "any" }]);
    user.questData = trackers;
  }
  return { user, settings, rewards };
};

export const fetchPublicUsers = async (
  client: DrizzleClient,
  input: GetPublicUsersSchema,
  userId?: string | null,
) => {
  const currentCursor = input.cursor ? input.cursor : 0;
  const skip = currentCursor * input.limit;
  const getOrder = () => {
    switch (input.orderBy) {
      case "Online":
        return [desc(userData.updatedAt)];
      case "Strongest":
        return [desc(userData.level), desc(userData.experience)];
      case "PvP":
        return [desc(userData.pvpStreak), desc(userData.experience)];
      case "Weakest":
        return [asc(userData.level), asc(userData.experience)];
      case "Staff":
        return [desc(userData.role)];
    }
  };
  const [users, user] = await Promise.all([
    client.query.userData.findMany({
      where: and(
        eq(userData.isAi, input.isAi),
        ...(input.username !== undefined
          ? [like(userData.username, `%${input.username}%`)]
          : []),
        ...(input.bloodline !== undefined
          ? [eq(userData.bloodlineId, input.bloodline)]
          : []),
        ...(input.ip ? [like(userData.lastIp, `%${input.ip}%`)] : []),
        ...(input.village !== undefined ? [eq(userData.villageId, input.village)] : []),
        ...(input.recruiterId ? [eq(userData.recruiterId, input.recruiterId)] : []),
        ...(input.orderBy === "Staff" ? [notInArray(userData.role, ["USER"])] : []),
        ...(input.isAi === false
          ? [eq(userData.isSummon, false)]
          : [eq(userData.isAi, true)]),
      ),
      columns: {
        userId: true,
        username: true,
        avatar: true,
        rank: true,
        isOutlaw: true,
        level: true,
        role: true,
        experience: true,
        updatedAt: true,
        reputationPointsTotal: true,
        lastIp: true,
        pvpStreak: true,
      },
      // If AI, also include relations information
      with: {
        village: { columns: { name: true } },
        ...(input.isAi
          ? {
              jutsus: {
                columns: {
                  level: true,
                },
                with: {
                  jutsu: {
                    columns: {
                      name: true,
                    },
                  },
                },
              },
            }
          : {}),
      },
      offset: skip,
      limit: input.limit,
      orderBy: getOrder(),
    }),
    ...(userId ? [fetchUser(client, userId)] : [null]),
  ]);
  // Guard
  if (input.ip && (!user || !canSeeSecretData(user.role))) {
    throw serverError("FORBIDDEN", "You are not allowed to search IPs");
  }
  // Hide stuff
  users.filter((u) => !u.lastIp).forEach((u) => (u.lastIp = "Proxied"));
  if (!user || !canSeeSecretData(user.role)) {
    users.forEach((u) => (u.lastIp = "hidden"));
  }
  // Return
  const nextCursor = users.length < input.limit ? null : currentCursor + 1;
  return {
    data: users,
    nextCursor: nextCursor,
  };
};
export type FetchedPublicUsers = ReturnType<typeof fetchPublicUsers>;

export const fetchAttributes = async (client: DrizzleClient, userId: string) => {
  return await client.query.userAttribute.findMany({
    where: eq(userAttribute.userId, userId),
  });
};

export type UserWithRelations =
  | (UserData & {
      bloodline?: Bloodline | null;
      anbuSquad?: { name: string } | null;
      clan?: Clan | null;
      village?:
        | (Village & {
            structures?: VillageStructure[];
            relationshipA?: VillageAlliance[];
            relationshipB?: VillageAlliance[];
          })
        | null;
      loadout?: { jutsuIds: string[] } | null;
      userQuests: UserQuest[];
    })
  | undefined;

export type AiWithRelations = UserData & {
  jutsus: (UserJutsu & { jutsu: Jutsu })[];
  items: (UserItem & { item: Item })[];
};
