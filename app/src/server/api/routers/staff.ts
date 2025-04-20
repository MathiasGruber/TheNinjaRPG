import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { baseServerResponse, errorResponse } from "@/server/api/trpc";
import { fetchBadge } from "@/routers/badge";
import { eq, and } from "drizzle-orm";
import {
  actionLog,
  aiProfile,
  automatedModeration,
  bankTransfers,
  bloodlineRolls,
  captcha,
  conceptImage,
  conversation,
  conversationComment,
  damageSimulation,
  forumPost,
  forumThread,
  historicalAvatar,
  jutsuLoadout,
  kageDefendedChallenges,
  linkPromotion,
  mpvpBattleUser,
  notification,
  paypalSubscription,
  paypalTransaction,
  poll,
  pollOption,
  questHistory,
  reportLog,
  ryoTrade,
  supportReview,
  trainingLog,
  user2conversation,
  userAttribute,
  userBadge,
  userBlackList,
  userData,
  userItem,
  userJutsu,
  userLikes,
  userNindo,
  userPollVote,
  userReport,
  userReportComment,
  userRequest,
  userReview,
  userRewards,
  userUpload,
  userVote,
  village,
} from "@/drizzle/schema";
import { fetchUser } from "@/routers/profile";
import { getServerPusher, updateUserOnMap } from "@/libs/pusher";
import { z } from "zod";
import { nanoid } from "nanoid";
import { canUnstuckVillage, canModifyUserBadges } from "@/utils/permissions";
import type { inferRouterOutputs } from "@trpc/server";
import type { UserStatus } from "@/drizzle/constants";

export const staffRouter = createTRPCRouter({
  forceAwake: protectedProcedure
    .output(baseServerResponse)
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, targetUser] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
      ]);
      // Guard
      if (!user) return errorResponse("User not found");
      if (!canUnstuckVillage(user.role)) return errorResponse("Not allowed for you");
      // Mutate
      await Promise.all([
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          relatedId: input.userId,
          relatedMsg: `Force updated status to awake from status: ${targetUser.status}`,
          changes: [`Previous BattleId: ${targetUser.battleId}`],
        }),
        ctx.drizzle
          .update(userData)
          .set({ status: "AWAKE", travelFinishAt: null, battleId: null })
          .where(eq(userData.userId, targetUser.userId)),
      ]);
      // Push status update to sector
      const output = {
        longitude: user.longitude,
        latitude: user.latitude,
        sector: user.sector,
        avatar: user.avatar,
        level: user.level,
        villageId: user.villageId,
        battleId: user.battleId,
        username: user.username,
        status: "AWAKE" as UserStatus,
        location: "",
        userId: ctx.userId,
      };
      const pusher = getServerPusher();
      void updateUserOnMap(pusher, user.sector, output);
      // Done
      return {
        success: true,
        message: "You have changed user's state to awake",
      };
    }),
  insertUserBadge: protectedProcedure
    .input(z.object({ userId: z.string(), badgeId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, badge] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchBadge(ctx.drizzle, input.badgeId),
      ]);
      // Guard
      if (!user) return errorResponse("User not found");
      if (!badge) return errorResponse("Badge not found");
      if (!canModifyUserBadges(user.role)) return errorResponse("Not allowed for you");
      // Mutate
      await Promise.all([
        ctx.drizzle
          .insert(userBadge)
          .values([{ userId: input.userId, badgeId: input.badgeId }]),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`Insert badge: ${badge.name}`],
          relatedId: input.userId,
          relatedMsg: `Insert badge: ${badge.name}`,
          relatedImage: user.avatarLight,
        }),
      ]);
      return { success: true, message: "Badge added" };
    }),
  removeUserBadge: protectedProcedure
    .input(z.object({ userId: z.string(), badgeId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, badge, userbadge] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchBadge(ctx.drizzle, input.badgeId),
        ctx.drizzle.query.userBadge.findFirst({
          where: and(
            eq(userBadge.userId, input.userId),
            eq(userBadge.badgeId, input.badgeId),
          ),
        }),
      ]);
      // Guard
      if (!user) return errorResponse("User not found");
      if (!badge) return errorResponse("Badge not found");
      if (!userbadge) return errorResponse("Badge not found");
      if (!canModifyUserBadges(user.role)) return errorResponse("Not allowed for you");
      // Mutate
      await Promise.all([
        ctx.drizzle
          .delete(userBadge)
          .where(
            and(
              eq(userBadge.userId, input.userId),
              eq(userBadge.badgeId, input.badgeId),
            ),
          ),
        ctx.drizzle.insert(actionLog).values({
          id: nanoid(),
          userId: ctx.userId,
          tableName: "user",
          changes: [`Remove badge: ${badge.name}`],
          relatedId: input.userId,
          relatedMsg: `Remove badge: ${badge.name}`,
          relatedImage: user.avatarLight,
        }),
      ]);

      return { success: true, message: "Badge removed" };
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
  // Update all occurances of a user ID in the database to another userId.
  // VERY dangerous - used to e.g. link up unlinked accounts with new userIds from clerk
  updateUserId: protectedProcedure
    .input(z.object({ userId: z.string(), newUserId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, fromUser, toUser] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
        ctx.drizzle.query.userData.findFirst({
          where: eq(userData.userId, input.newUserId),
        }),
      ]);
      // Guard
      if (toUser) {
        return { success: false, message: "UserId already exists" };
      }
      if (user.username !== "Terriator") {
        return { success: false, message: "You are not Terriator" };
      }
      if (fromUser.role !== "USER") {
        return { success: false, message: "Cannot change staff member's userId " };
      }
      // Mutate
      await Promise.all([
        ctx.drizzle
          .update(userData)
          .set({ userId: input.newUserId })
          .where(eq(userData.userId, input.userId)),
        ctx.drizzle
          .update(aiProfile)
          .set({ userId: input.newUserId })
          .where(eq(aiProfile.userId, input.userId)),
        ctx.drizzle
          .update(userBlackList)
          .set({ creatorUserId: input.newUserId })
          .where(eq(userBlackList.creatorUserId, input.userId)),
        ctx.drizzle
          .update(userBlackList)
          .set({ targetUserId: input.newUserId })
          .where(eq(userBlackList.targetUserId, input.userId)),
        ctx.drizzle
          .update(bloodlineRolls)
          .set({ userId: input.newUserId })
          .where(eq(bloodlineRolls.userId, input.userId)),
        ctx.drizzle
          .update(captcha)
          .set({ userId: input.newUserId })
          .where(eq(captcha.userId, input.userId)),
        ctx.drizzle
          .update(mpvpBattleUser)
          .set({ userId: input.newUserId })
          .where(eq(mpvpBattleUser.userId, input.userId)),
        ctx.drizzle
          .update(conversation)
          .set({ createdById: input.newUserId })
          .where(eq(conversation.createdById, input.userId)),
        ctx.drizzle
          .update(user2conversation)
          .set({ userId: input.newUserId })
          .where(eq(user2conversation.userId, input.userId)),
        ctx.drizzle
          .update(conversationComment)
          .set({ userId: input.newUserId })
          .where(eq(conversationComment.userId, input.userId)),
        ctx.drizzle
          .update(damageSimulation)
          .set({ userId: input.newUserId })
          .where(eq(damageSimulation.userId, input.userId)),
        ctx.drizzle
          .update(forumPost)
          .set({ userId: input.newUserId })
          .where(eq(forumPost.userId, input.userId)),
        ctx.drizzle
          .update(forumThread)
          .set({ userId: input.newUserId })
          .where(eq(forumThread.userId, input.userId)),
        ctx.drizzle
          .update(historicalAvatar)
          .set({ userId: input.newUserId })
          .where(eq(historicalAvatar.userId, input.userId)),
        ctx.drizzle
          .update(jutsuLoadout)
          .set({ userId: input.newUserId })
          .where(eq(jutsuLoadout.userId, input.userId)),
        ctx.drizzle
          .update(notification)
          .set({ userId: input.newUserId })
          .where(eq(notification.userId, input.userId)),
        ctx.drizzle
          .update(paypalSubscription)
          .set({ createdById: input.newUserId })
          .where(eq(paypalSubscription.createdById, input.userId)),
        ctx.drizzle
          .update(paypalSubscription)
          .set({ affectedUserId: input.newUserId })
          .where(eq(paypalSubscription.affectedUserId, input.userId)),
        ctx.drizzle
          .update(paypalTransaction)
          .set({ affectedUserId: input.newUserId })
          .where(eq(paypalTransaction.affectedUserId, input.userId)),
        ctx.drizzle
          .update(paypalTransaction)
          .set({ createdById: input.newUserId })
          .where(eq(paypalTransaction.createdById, input.userId)),
        ctx.drizzle
          .update(ryoTrade)
          .set({ creatorUserId: input.newUserId })
          .where(eq(ryoTrade.creatorUserId, input.userId)),
        ctx.drizzle
          .update(ryoTrade)
          .set({ purchaserUserId: input.newUserId })
          .where(eq(ryoTrade.purchaserUserId, input.userId)),
        ctx.drizzle
          .update(ryoTrade)
          .set({ allowedPurchaserId: input.newUserId })
          .where(eq(ryoTrade.allowedPurchaserId, input.userId)),
        ctx.drizzle
          .update(reportLog)
          .set({ targetUserId: input.newUserId })
          .where(eq(reportLog.targetUserId, input.userId)),
        ctx.drizzle
          .update(reportLog)
          .set({ staffUserId: input.newUserId })
          .where(eq(reportLog.staffUserId, input.userId)),
        ctx.drizzle
          .update(actionLog)
          .set({ userId: input.newUserId })
          .where(eq(actionLog.userId, input.userId)),
        ctx.drizzle
          .update(trainingLog)
          .set({ userId: input.newUserId })
          .where(eq(trainingLog.userId, input.userId)),
        ctx.drizzle
          .update(userAttribute)
          .set({ userId: input.newUserId })
          .where(eq(userAttribute.userId, input.userId)),
        ctx.drizzle
          .update(userReview)
          .set({ authorUserId: input.newUserId })
          .where(eq(userReview.authorUserId, input.userId)),
        ctx.drizzle
          .update(userRewards)
          .set({ awardedById: input.newUserId })
          .where(eq(userRewards.awardedById, input.userId)),
        ctx.drizzle
          .update(userRewards)
          .set({ receiverId: input.newUserId })
          .where(eq(userRewards.receiverId, input.userId)),
        ctx.drizzle
          .update(userReview)
          .set({ targetUserId: input.newUserId })
          .where(eq(userReview.targetUserId, input.userId)),
        ctx.drizzle
          .update(userNindo)
          .set({ userId: input.newUserId })
          .where(eq(userNindo.userId, input.userId)),
        ctx.drizzle
          .update(userItem)
          .set({ userId: input.newUserId })
          .where(eq(userItem.userId, input.userId)),
        ctx.drizzle
          .update(userJutsu)
          .set({ userId: input.newUserId })
          .where(eq(userJutsu.userId, input.userId)),
        ctx.drizzle
          .update(userReport)
          .set({ reporterUserId: input.newUserId })
          .where(eq(userReport.reporterUserId, input.userId)),
        ctx.drizzle
          .update(userReport)
          .set({ reportedUserId: input.newUserId })
          .where(eq(userReport.reportedUserId, input.userId)),
        ctx.drizzle
          .update(userReportComment)
          .set({ userId: input.newUserId })
          .where(eq(userReportComment.userId, input.userId)),
        ctx.drizzle
          .update(bankTransfers)
          .set({ senderId: input.newUserId })
          .where(eq(bankTransfers.senderId, input.userId)),
        ctx.drizzle
          .update(bankTransfers)
          .set({ receiverId: input.newUserId })
          .where(eq(bankTransfers.receiverId, input.userId)),
        ctx.drizzle
          .update(automatedModeration)
          .set({ userId: input.newUserId })
          .where(eq(automatedModeration.userId, input.userId)),
        ctx.drizzle
          .update(supportReview)
          .set({ userId: input.newUserId })
          .where(eq(supportReview.userId, input.userId)),
        ctx.drizzle
          .update(kageDefendedChallenges)
          .set({ userId: input.newUserId })
          .where(eq(kageDefendedChallenges.userId, input.userId)),
        ctx.drizzle
          .update(kageDefendedChallenges)
          .set({ kageId: input.newUserId })
          .where(eq(kageDefendedChallenges.kageId, input.userId)),
        ctx.drizzle
          .update(questHistory)
          .set({ userId: input.newUserId })
          .where(eq(questHistory.userId, input.userId)),
        ctx.drizzle
          .update(userLikes)
          .set({ userId: input.newUserId })
          .where(eq(userLikes.userId, input.userId)),
        ctx.drizzle
          .update(conceptImage)
          .set({ userId: input.newUserId })
          .where(eq(conceptImage.userId, input.userId)),
        ctx.drizzle
          .update(userBadge)
          .set({ userId: input.newUserId })
          .where(eq(userBadge.userId, input.userId)),
        ctx.drizzle
          .update(userRequest)
          .set({ senderId: input.newUserId })
          .where(eq(userRequest.senderId, input.userId)),
        ctx.drizzle
          .update(userRequest)
          .set({ receiverId: input.newUserId })
          .where(eq(userRequest.receiverId, input.userId)),
        ctx.drizzle
          .update(linkPromotion)
          .set({ userId: input.newUserId })
          .where(eq(linkPromotion.userId, input.userId)),
        ctx.drizzle
          .update(linkPromotion)
          .set({ reviewedBy: input.newUserId })
          .where(eq(linkPromotion.reviewedBy, input.userId)),
        ctx.drizzle
          .update(userVote)
          .set({ userId: input.newUserId })
          .where(eq(userVote.userId, input.userId)),
        ctx.drizzle
          .update(poll)
          .set({ createdByUserId: input.newUserId })
          .where(eq(poll.createdByUserId, input.userId)),
        ctx.drizzle
          .update(pollOption)
          .set({ targetUserId: input.newUserId })
          .where(eq(pollOption.targetUserId, input.userId)),
        ctx.drizzle
          .update(pollOption)
          .set({ createdByUserId: input.newUserId })
          .where(eq(pollOption.createdByUserId, input.userId)),
        ctx.drizzle
          .update(village)
          .set({ kageId: input.newUserId })
          .where(eq(village.kageId, input.userId)),
        ctx.drizzle
          .update(userPollVote)
          .set({ userId: input.newUserId })
          .where(eq(userPollVote.userId, input.userId)),
        ctx.drizzle
          .update(userUpload)
          .set({ userId: input.newUserId })
          .where(eq(userUpload.userId, input.userId)),
      ]);

      return { success: true, message: "UserId updated" };
    }),
});

export type staffRouter = inferRouterOutputs<typeof staffRouter>;
