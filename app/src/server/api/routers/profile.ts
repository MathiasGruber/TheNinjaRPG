import { z } from "zod";
import { nanoid } from "nanoid";
import {
  eq,
  ne,
  sql,
  gte,
  and,
  or,
  like,
  asc,
  desc,
  isNull,
  isNotNull,
} from "drizzle-orm";
import { inArray, notInArray } from "drizzle-orm";
import { secondsPassed } from "@/utils/time";
import { round } from "@/utils/math";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import {
  userData,
  bankTransfers,
  userAttribute,
  historicalAvatar,
  reportLog,
  userReportComment,
  forumPost,
  conversationComment,
  user2conversation,
  userReport,
  userNindo,
  userItem,
  userJutsu,
  jutsu,
  actionLog,
  notification,
  questHistory,
  quest,
  village,
} from "@/drizzle/schema";
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
import { energyPerSecond } from "@/libs/train";
import { trainingMultiplier } from "@/libs/train";
import { trainEfficiency } from "@/libs/train";
import { calcHP, calcSP, calcCP } from "@/libs/profile";
import { COST_CHANGE_USERNAME } from "@/drizzle/constants";
import { MAX_ATTRIBUTES } from "@/drizzle/constants";
import { createStatSchema } from "@/libs/combat/types";
import { calcIsInVillage } from "@/libs/travel/controls";
import { UserStatNames } from "@/drizzle/constants";
import { TrainingSpeeds } from "@/drizzle/constants";
import { updateUserSchema } from "@/validators/user";
import { canChangeUserRole } from "@/utils/permissions";
import { UserRanks, BasicElementName } from "@/drizzle/constants";
import { getRandomElement } from "@/utils/array";
import { setEmptyStringsToNulls } from "@/utils/typeutils";
import { structureBoost } from "@/utils/village";
import { capUserStats } from "@/libs/profile";
import { getServerPusher } from "@/libs/pusher";
import { RYO_CAP } from "@/drizzle/constants";
import HumanDiff from "human-object-diff";
import type { UserData, Bloodline, Village, VillageStructure } from "@/drizzle/schema";
import type { UserQuest } from "@/drizzle/schema";
import type { DrizzleClient } from "@/server/db";
import type { NavBarDropdownLink } from "@/libs/menus";
import type { ExecutedQuery } from "@planetscale/database";

const pusher = getServerPusher();

export const profileRouter = createTRPCRouter({
  // Get all AI names
  getAllAiNames: publicProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.userData.findMany({
      where: and(eq(userData.isAi, 1), ne(userData.rank, "ELDER")),
      columns: {
        userId: true,
        username: true,
        level: true,
        avatar: true,
        isSummon: true,
      },
      orderBy: asc(userData.level),
    });
  }),
  // Start training of a specific attribute
  startTraining: protectedProcedure
    .input(z.object({ stat: z.enum(UserStatNames) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        userIp: ctx.userIp,
        forceRegen: true,
      });
      // Derived
      if (!user) throw serverError("NOT_FOUND", "User not found");
      const inVillage = calcIsInVillage({ x: user.longitude, y: user.latitude });
      // Guard
      if (user.curEnergy < 1) return errorResponse("Not enough energy");
      if (user.status !== "AWAKE") return errorResponse("Must be awake to train");
      if (!user.isOutlaw) {
        if (!inVillage) return errorResponse("Must be in your own village");
        if (user.sector !== user.village?.sector) return errorResponse("Wrong sector");
      }
      if (user.trainingSpeed !== "8hrs" && user.isBanned) {
        return errorResponse("Only 8hrs training interval allowed when banned");
      }

      // Mutate
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingStartedAt: new Date(), currentlyTraining: input.stat })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            isNull(userData.currentlyTraining),
            eq(userData.status, "AWAKE"),
          ),
        );
      if (result.rowsAffected === 0) {
        return errorResponse("You are already training");
      } else {
        return { success: true, message: `Started training` };
      }
    }),
  // Stop training
  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      // Query
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        forceRegen: true,
      });
      // Guard
      if (!user) throw serverError("NOT_FOUND", "User not found");
      if (user.status !== "AWAKE") return errorResponse("Must be awake");
      if (!user.trainingStartedAt) return errorResponse("Not currently training");
      if (!user.currentlyTraining) return errorResponse("Not currently training");
      // Derived
      const boost = structureBoost("trainBoostPerLvl", user.village?.structures);
      const clanBoost = user?.clan?.trainingBoost || 0;
      const factor = 1 + boost / 100 + clanBoost / 100;
      const seconds = (Date.now() - user.trainingStartedAt.getTime()) / 1000;
      const minutes = seconds / 60;
      const energySpent = Math.min(
        Math.floor(energyPerSecond(user.trainingSpeed) * seconds),
        user.curEnergy,
      );
      const trainingAmount =
        factor *
        energySpent *
        trainEfficiency(user.trainingSpeed) *
        trainingMultiplier(user.trainingSpeed);
      // Mutate
      const { trackers } = getNewTrackers(user, [
        { task: "stats_trained", increment: trainingAmount },
        { task: "minutes_training", increment: minutes },
      ]);
      user.questData = trackers;
      const result = await ctx.drizzle
        .update(userData)
        .set({
          trainingStartedAt: null,
          currentlyTraining: null,
          curEnergy: sql`curEnergy - ${energySpent}`,
          experience: sql`experience + ${trainingAmount}`,
          strength:
            user.currentlyTraining === "strength"
              ? sql`strength + ${trainingAmount}`
              : sql`strength`,
          intelligence:
            user.currentlyTraining === "intelligence"
              ? sql`intelligence + ${trainingAmount}`
              : sql`intelligence`,
          willpower:
            user.currentlyTraining === "willpower"
              ? sql`willpower + ${trainingAmount}`
              : sql`willpower`,
          speed:
            user.currentlyTraining === "speed"
              ? sql`speed + ${trainingAmount}`
              : sql`speed`,
          ninjutsuOffence:
            user.currentlyTraining === "ninjutsuOffence"
              ? sql`ninjutsuOffence + ${trainingAmount}`
              : sql`ninjutsuOffence`,
          ninjutsuDefence:
            user.currentlyTraining === "ninjutsuDefence"
              ? sql`ninjutsuDefence + ${trainingAmount}`
              : sql`ninjutsuDefence`,
          genjutsuOffence:
            user.currentlyTraining === "genjutsuOffence"
              ? sql`genjutsuOffence + ${trainingAmount}`
              : sql`genjutsuOffence`,
          genjutsuDefence:
            user.currentlyTraining === "genjutsuDefence"
              ? sql`genjutsuDefence + ${trainingAmount}`
              : sql`genjutsuDefence`,
          taijutsuOffence:
            user.currentlyTraining === "taijutsuOffence"
              ? sql`taijutsuOffence + ${trainingAmount}`
              : sql`taijutsuOffence`,
          taijutsuDefence:
            user.currentlyTraining === "taijutsuDefence"
              ? sql`taijutsuDefence + ${trainingAmount}`
              : sql`taijutsuDefence`,
          bukijutsuDefence:
            user.currentlyTraining === "bukijutsuDefence"
              ? sql`bukijutsuDefence + ${trainingAmount}`
              : sql`bukijutsuDefence`,
          bukijutsuOffence:
            user.currentlyTraining === "bukijutsuOffence"
              ? sql`bukijutsuOffence + ${trainingAmount}`
              : sql`bukijutsuOffence`,
          questData: user.questData,
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            isNotNull(userData.currentlyTraining),
            eq(userData.status, "AWAKE"),
          ),
        );
      if (result.rowsAffected === 0) {
        return { success: false, message: "You are not training" };
      } else {
        return {
          success: true,
          message: `You gained ${trainingAmount} ${user.currentlyTraining}`,
        };
      }
    }),
  // Update user with new level
  levelUp: protectedProcedure.mutation(async ({ ctx }) => {
    const { user } = await fetchUpdatedUser({
      client: ctx.drizzle,
      userId: ctx.userId,
    });
    if (!user) {
      throw serverError("NOT_FOUND", "User not found");
    }
    const expRequired = calcLevelRequirements(user.level) - user.experience;
    if (expRequired > 0) {
      throw serverError("PRECONDITION_FAILED", "Not enough experience to level up");
    }
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
        }),
      ]);
    }
    return result.rowsAffected === 0 ? user.level : newLevel;
  }),
  // Get all information on logged in user
  getUser: protectedProcedure
    .input(z.object({ token: z.string().optional().nullable() }))
    .query(async ({ ctx }) => {
      const { user, rewards } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
        // forceRegen: true, // This should be disabled in prod to save on DB calls
      });
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
        where: and(eq(userData.userId, input.userId), eq(userData.isAi, 1)),
        with: { jutsus: { with: { jutsu: true } } },
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
        avatar: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        villageId: null,
        approvedTos: 1,
        sector: 0,
        level: 100,
        isAi: 1,
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
  // Update user training speed
  updateTrainingSpeed: protectedProcedure
    .input(z.object({ speed: z.enum(TrainingSpeeds) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const { user } = await fetchUpdatedUser({
        client: ctx.drizzle,
        userId: ctx.userId,
      });
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.currentlyTraining) {
        return {
          success: false,
          message: "Cannot change training speed while training",
        };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingSpeed: input.speed })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        return { success: true, message: "Training speed updated" };
      }
    }),
  // Update user
  updateUser: protectedProcedure
    .input(z.object({ id: z.string(), data: updateUserSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Queries
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const target = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, input.id),
      });
      const availableRoles = canChangeUserRole(user.role);
      // Guards
      if (!target) {
        return { success: false, message: `User not found` };
      }
      if (!availableRoles) {
        return { success: false, message: `Not allowed to change user roles` };
      }
      if (!availableRoles.includes(target.role)) {
        return {
          success: false,
          message: `Not allowed to change users with role ${target.role}`,
        };
      }
      if (!availableRoles.includes(input.data.role)) {
        return {
          success: false,
          message: `Only available roles: ${availableRoles.join(", ")}`,
        };
      }
      // Calculate diff
      const prev = Object.fromEntries(
        Object.entries(target).filter(([k]) => Object.keys(input.data).includes(k)),
      );
      const diff = new HumanDiff({ objectName: "user" }).diff(prev, input.data);
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

      // Queries
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const ai = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, input.id),
        with: { jutsus: true },
      });
      // Guards
      if (!ai) {
        return { success: false, message: `AI not found` };
      }
      if (!ai.isAi || !canChangeContent(user.role)) {
        return { success: false, message: `Not allowed to edit AI` };
      }

      // Store any new jutsus
      const olds = [...ai.jutsus.map((j) => j.jutsuId)];
      const news = input.data.jutsus ? [...input.data.jutsus] : [];
      const newJutsus = olds.sort().join(",") !== news.sort().join(",");

      // If jutsus are different, then update with jutsu names for diff calculation only
      let jutsuChanges: string[] = [];
      if (newJutsus) {
        const data = await ctx.drizzle.query.jutsu.findMany({
          where: inArray(jutsu.id, olds.concat(news)),
          columns: { id: true, name: true },
        });
        const s1 = { jutsus: olds.map((id) => data.find((j) => j.id === id)?.name) };
        const s2 = { jutsus: news.map((id) => data.find((j) => j.id === id)?.name) };
        jutsuChanges = new HumanDiff({ objectName: "jutsu" }).diff(s1, s2);
      }

      // Delete jutsus from objects
      ai.jutsus = [];
      input.data.jutsus = [];

      // Update input data based on level
      const newAi = { ...ai, ...input.data } as UserData;

      // Level-based stats / pools
      scaleUserStats(newAi);

      // Calculate diff
      const diff = new HumanDiff({ objectName: "user" })
        .diff(ai, newAi)
        .concat(jutsuChanges);

      // Update jutsus if needed
      if (newJutsus) {
        await Promise.all([
          ctx.drizzle.delete(userJutsu).where(eq(userJutsu.userId, ai.userId)),
          ctx.drizzle.insert(userJutsu).values(
            news.map((jutsuId) => ({
              id: nanoid(),
              userId: newAi.userId,
              jutsuId: jutsuId,
              level: newAi.level,
              equipped: 1,
            })),
          ),
        ]);
      }

      // Update database
      const insertAi = { ...newAi } as UserData & { jutsus?: string[] };
      delete insertAi.jutsus;
      await Promise.all([
        ctx.drizzle.update(userData).set(insertAi).where(eq(userData.userId, input.id)),
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
          tableName: "userData",
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
      const inputSum = round(Object.values(input).reduce((a, b) => a + b, 0));
      // Guard
      if (user.earnedExperience <= 0) return errorResponse("No experience left");
      if (inputSum > user.earnedExperience) {
        return errorResponse("Trying to assign more stats than available");
      }
      // Mutate & cap
      user.ninjutsuOffence += input.ninjutsuOffence;
      user.taijutsuOffence += input.taijutsuOffence;
      user.genjutsuOffence += input.genjutsuOffence;
      user.bukijutsuOffence += input.bukijutsuOffence;
      user.ninjutsuDefence += input.ninjutsuDefence;
      user.taijutsuDefence += input.taijutsuDefence;
      user.genjutsuDefence += input.genjutsuDefence;
      user.bukijutsuDefence += input.bukijutsuDefence;
      user.strength += input.strength;
      user.speed += input.speed;
      user.intelligence += input.intelligence;
      user.willpower += input.willpower;
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
        },
        where: and(
          like(userData.username, `%${input.username}%`),
          eq(userData.approvedTos, 1),
          ...(input.showYourself ? [] : [sql`${userData.userId} != ${ctx.userId}`]),
        ),
        orderBy: [sql`LENGTH(${userData.username}) asc`],
        limit: 5,
      });
    }),
  // Get public information on a user
  getPublicUser: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.drizzle.query.userData.findFirst({
        where: and(eq(userData.userId, input.userId)),
        columns: {
          userId: true,
          username: true,
          gender: true,
          status: true,
          rank: true,
          isOutlaw: true,
          curHealth: true,
          maxHealth: true,
          curStamina: true,
          maxStamina: true,
          curChakra: true,
          maxChakra: true,
          level: true,
          role: true,
          senseiId: true,
          reputationPoints: true,
          experience: true,
          avatar: true,
          isAi: true,
          federalStatus: true,
          customTitle: true,
        },
        with: {
          village: true,
          bloodline: true,
          nindo: true,
          badges: {
            with: {
              badge: true,
            },
          },
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
      });
      return user ?? null;
    }),
  // Get public users
  getPublicUsers: publicProcedure
    .input(
      z.object({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        isAi: z.number().min(0).max(1).default(0),
        orderBy: z.enum(["Online", "Strongest", "Weakest", "Staff"]),
        villageId: z.string().optional(),
        username: z
          .string()
          .regex(new RegExp("^[a-zA-Z0-9_]*$"), {
            message: "Must only contain alphanumeric characters and no spaces",
          })
          .optional(),
        recruiterId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const getOrder = () => {
        switch (input.orderBy) {
          case "Online":
            return [desc(userData.updatedAt)];
          case "Strongest":
            return [desc(userData.level), desc(userData.experience)];
          case "Weakest":
            return [asc(userData.level), asc(userData.experience)];
          case "Staff":
            return [desc(userData.role)];
        }
      };
      const users = await ctx.drizzle.query.userData.findMany({
        where: and(
          ...(input.username !== undefined
            ? [like(userData.username, `%${input.username}%`)]
            : []),
          ...(input.villageId !== undefined
            ? [eq(userData.villageId, input.villageId)]
            : []),
          ...(input.recruiterId ? [eq(userData.recruiterId, input.recruiterId)] : []),
          ...(input.orderBy === "Staff" ? [notInArray(userData.role, ["USER"])] : []),
          eq(userData.isAi, input.isAi),
          ...(input.isAi === 0 ? [eq(userData.isSummon, 0)] : [eq(userData.isAi, 1)]),
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
        },
        // If AI, also include relations information
        with: {
          ...(input.isAi === 1
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
      });
      const nextCursor = users.length < input.limit ? null : currentCursor + 1;
      return {
        data: users,
        nextCursor: nextCursor,
      };
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
    const currentUser = await fetchUser(ctx.drizzle, ctx.userId);
    if (!currentUser.deletionAt || currentUser.deletionAt > new Date()) {
      throw serverError("PRECONDITION_FAILED", "Deletion timer not passed yet");
    }
    if (currentUser.isBanned) {
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
            curEnergy: target.curEnergy,
            maxEnergy: target.maxEnergy,
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
    await tx.delete(userData).where(eq(userData.userId, userId));
    await tx.delete(userJutsu).where(eq(userJutsu.userId, userId));
    await tx.delete(userItem).where(eq(userItem.userId, userId));
    await tx.delete(userAttribute).where(eq(userAttribute.userId, userId));
    await tx.delete(historicalAvatar).where(eq(historicalAvatar.userId, userId));
    await tx.delete(userReportComment).where(eq(userReportComment.userId, userId));
    await tx.delete(forumPost).where(eq(forumPost.userId, userId));
    await tx.delete(conversationComment).where(eq(conversationComment.userId, userId));
    await tx.delete(user2conversation).where(eq(user2conversation.userId, userId));
    await tx
      .delete(reportLog)
      .where(or(eq(reportLog.targetUserId, userId), eq(reportLog.staffUserId, userId)));
  });
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
  const [achievements, user] = await Promise.all([
    client.select().from(quest).where(eq(quest.questType, "achievement")),
    client.query.userData.findFirst({
      where: eq(userData.userId, userId),
      with: {
        bloodline: true,
        village: {
          with: { structures: true },
        },
        anbuSquad: {
          columns: { name: true },
        },
        clan: true,
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
  }

  // Structure regen increase
  if (user) {
    const boost = structureBoost("regenIncreasePerLvl", user?.village?.structures);
    user.regeneration *= (100 + boost) / 100;
  }

  // Increase regen when asleep
  if (user?.status === "ASLEEP") {
    const boost = structureBoost("sleepRegenPerLvl", user?.village?.structures);
    user.regeneration *= (100 + boost) / 100;
  }

  // const achievements = ;
  // const user = (await ) as UserWithRelations;

  // Add bloodline regen to regeneration
  // NOTE: We add this here, so that the "actual" current pools can be calculated on frontend,
  //       and we can avoid running an database UPDATE on each load
  if (user?.bloodline?.regenIncrease) {
    user.regeneration = user.regeneration + user.bloodline.regenIncrease;
  }

  // Rewards, e.g. for activity streak
  let rewards: ReturnType<typeof activityStreakRewards> | undefined;

  // If more than 5min since last user update, update the user with regen. We do not need this to be synchronous
  // and it is mostly done to keep user updated on the overview pages
  if (user && ["AWAKE", "ASLEEP"].includes(user.status)) {
    const sinceUpdate = secondsPassed(user.updatedAt);
    if (sinceUpdate > 300 || forceRegen || user.villagePrestige < 0) {
      const regen = user.regeneration * secondsPassed(user.regenAt);
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      if (!user.currentlyTraining) {
        user.curEnergy = Math.min(user.curEnergy + regen, user.maxEnergy);
      }
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
      if (user.villagePrestige < 0 && !user.village?.isOutlawFaction) {
        const faction = await client.query.village.findFirst({
          where: eq(village.isOutlawFaction, true),
        });
        if (faction) {
          user.villagePrestige = 0;
          user.villageId = faction.id;
          user.isOutlaw = true;
          if (user.clanId) {
            const clanData = await fetchClan(client, user.clanId);
            if (clanData) {
              await removeFromClan(client, clanData, user.userId);
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
          curEnergy: user.curEnergy,
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
  return { user, rewards };
};

export const fetchAttributes = async (client: DrizzleClient, userId: string) => {
  return await client.query.userAttribute.findMany({
    where: eq(userAttribute.userId, userId),
  });
};

export type UserWithRelations =
  | (UserData & {
      bloodline?: Bloodline | null;
      anbuSquad?: { name: string } | null;
      village?: (Village & { structures?: VillageStructure[] }) | null;
      loadout?: { jutsuIds: string[] } | null;
      userQuests: UserQuest[];
    })
  | undefined;
