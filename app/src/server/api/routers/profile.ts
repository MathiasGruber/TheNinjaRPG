import { z } from "zod";
import { nanoid } from "nanoid";
import { eq, sql, and, or, like, asc, desc, isNull, isNotNull } from "drizzle-orm";
import { inArray, notInArray } from "drizzle-orm";
import { secondsPassed } from "../../../utils/time";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { serverError, baseServerResponse } from "../trpc";
import {
  userData,
  userAttribute,
  historicalAvatar,
  reportLog,
  userReportComment,
  forumPost,
  conversationComment,
  user2conversation,
  userReport,
  userNindo,
  userJutsu,
  jutsu,
  actionLog,
  notification,
} from "../../../../drizzle/schema";
import { usernameSchema } from "../../../validators/register";
import { mutateContentSchema } from "../../../validators/comments";
import { attributes } from "../../../validators/register";
import { colors, skin_colors } from "../../../validators/register";
import { callDiscordContent } from "../../../libs/discord";
import { scaleUserStats } from "../../../../drizzle/seeds/ai";
import { insertUserDataSchema } from "../../../../drizzle/schema";
import { canChangeContent } from "../../../utils/permissions";
import { ENERGY_SPENT_PER_SECOND } from "../../../libs/train";
import { calcLevelRequirements } from "../../../libs/profile";
import { calcHP, calcSP, calcCP } from "../../../libs/profile";
import { COST_CHANGE_USERNAME, COST_RESET_STATS } from "../../../libs/profile";
import { MAX_ATTRIBUTES } from "../../../libs/profile";
import { statSchema } from "../../../libs/combat/types";
import { UserStatNames } from "../../../../drizzle/constants";
import HumanDiff from "human-object-diff";
import type { UserData } from "../../../../drizzle/schema";
import type { DrizzleClient } from "../../db";
import type { inferRouterOutputs } from "@trpc/server";
import type { NavBarDropdownLink } from "../../../libs/menus";
import type { ExecutedQuery } from "@planetscale/database";

export const profileRouter = createTRPCRouter({
  // Start training of a specific attribute
  startTraining: protectedProcedure
    .input(z.object({ stat: z.enum(UserStatNames) }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId, true);
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.curEnergy < 1) {
        return { success: false, message: "Not enough energy" };
      }
      if (user.status !== "AWAKE") {
        return { success: false, message: "Must be awake to start training" };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({ trainingStartedAt: new Date(), currentlyTraining: input.stat })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            isNull(userData.currentlyTraining),
            eq(userData.status, "AWAKE")
          )
        );
      if (result.rowsAffected === 0) {
        return { success: false, message: "You are already training" };
      } else {
        return { success: true, message: `Started training` };
      }
    }),
  // Stop training
  stopTraining: protectedProcedure
    .output(baseServerResponse)
    .mutation(async ({ ctx }) => {
      const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId, true);
      if (!user) {
        throw serverError("NOT_FOUND", "User not found");
      }
      if (user.status !== "AWAKE") {
        return { success: false, message: "Must be awake to stop training" };
      }
      if (!user.trainingStartedAt || !user.currentlyTraining) {
        return { success: false, message: "You are not currently training anything" };
      }
      const secondsPassed = (Date.now() - user.trainingStartedAt.getTime()) / 1000;
      const trainingAmount = Math.min(
        Math.floor(ENERGY_SPENT_PER_SECOND * secondsPassed),
        user.curEnergy
      );
      const result = await ctx.drizzle
        .update(userData)
        .set({
          trainingStartedAt: null,
          currentlyTraining: null,
          curEnergy: sql`curEnergy - ${trainingAmount}`,
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
        })
        .where(
          and(
            eq(userData.userId, ctx.userId),
            isNotNull(userData.currentlyTraining),
            eq(userData.status, "AWAKE")
          )
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
    const user = await fetchUser(ctx.drizzle, ctx.userId);
    const expRequired = calcLevelRequirements(user.level) - user.experience;
    if (expRequired > 0) {
      throw serverError("PRECONDITION_FAILED", "Not enough experience to level up");
    }
    const newLevel = user.level + 1;
    const result = await ctx.drizzle
      .update(userData)
      .set({
        level: newLevel,
        maxHealth: calcHP(newLevel),
        maxStamina: calcSP(newLevel),
        maxChakra: calcCP(newLevel),
      })
      .where(and(eq(userData.userId, ctx.userId), eq(userData.level, user.level)));
    return result.rowsAffected === 0 ? user.level : newLevel;
  }),
  // Get all information on logged in user
  getUser: protectedProcedure
    .input(z.object({ token: z.string().optional().nullable() }))
    .query(async ({ ctx }) => {
      const user = await fetchRegeneratedUser(ctx.drizzle, ctx.userId);
      const notifications: NavBarDropdownLink[] = [];
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
        with: { jutsus: true },
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
        username: "New AI",
        gender: "Unknown",
        avatar: "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp",
        villageId: null,
        approvedTos: 1,
        sector: 0,
        level: 999,
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
  // Update a AI
  updateAi: protectedProcedure
    .input(z.object({ id: z.string(), data: insertUserDataSchema }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const ai = await ctx.drizzle.query.userData.findFirst({
        where: eq(userData.userId, input.id),
        with: { jutsus: true },
      });
      if (ai && ai.isAi && canChangeContent(user.role)) {
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
          console.log("Old Jutsus: ", s1);
          console.log("New Jutsus: ", s2);
          jutsuChanges = new HumanDiff({ objectName: "jutsu" }).diff(s1, s2);
        }

        // Delete jutsus from objects
        ai.jutsus = [];
        input.data.jutsus = [];

        // Update input data based on level
        const newAi = { ...ai, ...input.data };

        // Level-based stats / pools
        scaleUserStats(newAi);

        // Calculate diff
        const diff = new HumanDiff({ objectName: "user" })
          .diff(ai, newAi)
          .concat(jutsuChanges);

        // Update jutsus if needed
        if (newJutsus) {
          await ctx.drizzle.delete(userJutsu).where(eq(userJutsu.userId, ai.userId));
          await ctx.drizzle.insert(userJutsu).values(
            news.map((jutsuId) => ({
              id: nanoid(),
              userId: newAi.userId,
              jutsuId: jutsuId,
              level: newAi.level,
              equipped: 1,
            }))
          );
        }

        // Update database
        const insertAi = { ...newAi } as UserData & { jutsus?: string[] };
        delete insertAi.jutsus;
        await ctx.drizzle
          .update(userData)
          .set(insertAi)
          .where(eq(userData.userId, input.id));
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "ai",
          changes: diff,
          relatedId: ai.userId,
          relatedMsg: `Update: ${ai.username}`,
          relatedImage: ai.avatar,
        });

        // Update discord channel
        if (process.env.NODE_ENV !== "development") {
          await callDiscordContent(user.username, ai.username, diff, ai.avatar);
        }
        return { success: true, message: `Data updated: ${diff.join(". ")}` };
      } else {
        return { success: false, message: `Not allowed to edit AI` };
      }
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
      })
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
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.username === input.username) {
        return { success: false, message: "Username is the same" };
      } else if (user.reputationPoints < COST_CHANGE_USERNAME) {
        return { success: false, message: "Not enough reputation points" };
      }
      const username = await ctx.drizzle.query.userData.findFirst({
        columns: { username: true },
        where: eq(userData.username, input.username),
      });
      if (username) {
        return { success: false, message: "Username already taken!" };
      }
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
  // Update username
  updateStats: protectedProcedure
    .input(statSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (user.reputationPoints < COST_RESET_STATS) {
        return { success: false, message: "Not enough reputation points" };
      }
      const inputSum = Object.values(input).reduce((a, b) => a + b, 0);
      if (inputSum !== user.experience + 120) {
        const message = `Requested points ${inputSum} for not match experience points ${user.experience}`;
        return { success: false, message };
      }
      const result = await ctx.drizzle
        .update(userData)
        .set({
          ninjutsuOffence: input.ninjutsuOffence,
          taijutsuOffence: input.taijutsuOffence,
          genjutsuOffence: input.genjutsuOffence,
          bukijutsuOffence: input.bukijutsuOffence,
          ninjutsuDefence: input.ninjutsuDefence,
          taijutsuDefence: input.taijutsuDefence,
          genjutsuDefence: input.genjutsuDefence,
          bukijutsuDefence: input.bukijutsuDefence,
          strength: input.strength,
          speed: input.speed,
          intelligence: input.intelligence,
          willpower: input.willpower,
          reputationPoints: sql`reputationPoints - ${COST_RESET_STATS}`,
        })
        .where(eq(userData.userId, ctx.userId));
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update user" };
      } else {
        await ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "userData",
          changes: [`User stats distribution changed`],
          relatedId: ctx.userId,
          relatedMsg: `Update: ${user.username} stats redistribution`,
          relatedImage: user.avatar,
        });
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
      const nindo = await ctx.drizzle.query.userNindo.findFirst({
        where: eq(userNindo.userId, ctx.userId),
      });
      let result: ExecutedQuery;
      if (!nindo) {
        result = await ctx.drizzle.insert(userNindo).values({
          id: nanoid(),
          userId: ctx.userId,
          content: input.content,
        });
      } else {
        result = await ctx.drizzle
          .update(userNindo)
          .set({ content: input.content })
          .where(eq(userNindo.userId, ctx.userId));
      }
      if (result.rowsAffected === 0) {
        return { success: false, message: "Could not update nindo" };
      } else {
        return { success: true, message: "Nindo updated" };
      }
    }),
  // Insert attribute
  insertAttribute: protectedProcedure
    .input(
      z.object({
        attribute: z.enum([...attributes, "Hair", "Skin", "Eyes"]),
        color: z.enum([...colors, ...skin_colors]).optional(),
      })
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
            eq(userAttribute.userId, ctx.userId)
          )
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
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.drizzle.query.userData.findMany({
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
          level: true,
          role: true,
          federalStatus: true,
        },
        where: and(
          like(userData.username, `%${input.username}%`),
          eq(userData.approvedTos, 1),
          ...(input.showYourself ? [] : [sql`${userData.userId} != ${ctx.userId}`])
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
          curHealth: true,
          maxHealth: true,
          curStamina: true,
          maxStamina: true,
          curChakra: true,
          maxChakra: true,
          level: true,
          role: true,
          reputationPoints: true,
          popularityPoints: true,
          experience: true,
          avatar: true,
          isAi: true,
          federalStatus: true,
        },
        with: {
          village: true,
          bloodline: true,
          nindo: true,
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
        username: z
          .string()
          .regex(new RegExp("^[a-zA-Z0-9_]*$"), {
            message: "Must only contain alphanumeric characters and no spaces",
          })
          .optional(),
      })
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
          ...(input.orderBy === "Staff" ? [notInArray(userData.role, ["USER"])] : []),
          ...(input.isAi === 1 ? [eq(userData.isAi, 1)] : [eq(userData.approvedTos, 1)])
        ),
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
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
    await deleteUser(ctx.drizzle, ctx.userId);
  }),
});

export const deleteUser = async (client: DrizzleClient, userId: string) => {
  await client.transaction(async (tx) => {
    await tx.delete(userData).where(eq(userData.userId, userId));
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
export const fetchRegeneratedUser = async (
  client: DrizzleClient,
  userId: string,
  forceRegen = false
) => {
  // Ensure we can fetch the user
  const user = await client.query.userData.findFirst({
    where: eq(userData.userId, userId),
    with: { bloodline: true, village: true },
  });

  // Add bloodline regen to regeneration
  // NOTE: We add this here, so that the "actual" current pools can be calculated on frontend,
  //       and we can avoid running an database UPDATE on each load
  if (user?.bloodline?.regenIncrease) {
    user.regeneration = user.regeneration + user.bloodline.regenIncrease;
  }
  // If more than 5min since last user update, update the user with regen. We do not need this to be synchronous
  // and it is mostly done to keep user updated on the overview pages
  if (user && ["AWAKE", "ASLEEP"].includes(user.status)) {
    const sinceUpdate = secondsPassed(user.updatedAt);
    if (sinceUpdate > 300 || forceRegen) {
      const regen = user.regeneration * secondsPassed(user.regenAt);
      user.curHealth = Math.min(user.curHealth + regen, user.maxHealth);
      user.curStamina = Math.min(user.curStamina + regen, user.maxStamina);
      user.curChakra = Math.min(user.curChakra + regen, user.maxChakra);
      if (!user.currentlyTraining) {
        user.curEnergy = Math.min(user.curEnergy + regen, user.maxEnergy);
      }
      user.updatedAt = new Date();
      user.regenAt = new Date();
      await client
        .update(userData)
        .set({
          curHealth: user.curHealth,
          curStamina: user.curStamina,
          curChakra: user.curChakra,
          curEnergy: user.curEnergy,
          updatedAt: user.updatedAt,
          regenAt: user.regenAt,
        })
        .where(eq(userData.userId, userId));
    }
  }
  return user;
};

export const fetchAttributes = async (client: DrizzleClient, userId: string) => {
  return await client.query.userAttribute.findMany({
    where: eq(userAttribute.userId, userId),
  });
};

type RouterOutput = inferRouterOutputs<typeof profileRouter>;
export type UserWithRelations = RouterOutput["getUser"]["userData"];
