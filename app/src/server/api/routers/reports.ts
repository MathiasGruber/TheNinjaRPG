import { z } from "zod";
import { nanoid } from "nanoid";
import { alias } from "drizzle-orm/mysql-core";
import { getTableColumns, sql } from "drizzle-orm";
import { eq, and, gte, ne, gt, lte, like, inArray, desc } from "drizzle-orm";
import { reportLog } from "@/drizzle/schema";
import { forumPost, conversationComment, userNindo } from "@/drizzle/schema";
import { userReport, userReportComment, userData, userReview } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import { userReportSchema } from "@/validators/reports";
import { reportCommentSchema } from "@/validators/reports";
import { requestAvatarForUser } from "@/libs/replicate";
import { canModerateReports } from "@/utils/permissions";
import { canSeeReport } from "@/utils/permissions";
import { canClearReport } from "@/utils/permissions";
import { canEscalateBan } from "@/utils/permissions";
import { canClearUserNindo } from "@/utils/permissions";
import { fetchUser } from "./profile";
import { fetchImage } from "./conceptart";
import { canSeeSecretData } from "@/utils/permissions";
import { getServerPusher } from "@/libs/pusher";
import { userReviewSchema } from "@/validators/reports";
import { getRelatedReports } from "@/libs/moderator";
import { getMillisecondsFromTimeUnit } from "@/utils/time";
import { TERR_BOT_ID } from "@/drizzle/constants";
import { generateModerationDecision } from "@/libs/moderator";
import { getAdditionalContext } from "@/libs/moderator";
import sanitize from "@/utils/sanitize";
import { canModerateRoles } from "@/utils/permissions";
import { reportFilteringSchema } from "@/validators/reports";
import type { BanState } from "@/drizzle/constants";
import type { ReportCommentSchema } from "@/validators/reports";
import type { AdditionalContext } from "@/validators/reports";
import type { DrizzleClient } from "../../db";

const pusher = getServerPusher();

export const reportsRouter = createTRPCRouter({
  getReportSystemNames: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle
      .selectDistinct({ system: userReport.system })
      .from(userReport);
  }),
  getReportStatistics: protectedProcedure.query(async ({ ctx }) => {
    const [user, staff, timesReported, timesReporting, decisions] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      await ctx.drizzle
        .select({
          userId: userData.userId,
          username: userData.username,
          avatar: userData.avatar,
        })
        .from(userData)
        .where(ne(userData.role, "USER")),
      await ctx.drizzle
        .select({
          userId: userData.userId,
          count: sql<number>`COUNT(${userReport.id})`.mapWith(Number),
        })
        .from(userReport)
        .innerJoin(userData, eq(userData.userId, userReport.reportedUserId))
        .groupBy(sql`${userReport.reportedUserId}`),
      await ctx.drizzle
        .select({
          userId: userData.userId,
          count: sql<number>`COUNT(${userReport.id})`.mapWith(Number),
        })
        .from(userReport)
        .innerJoin(userData, eq(userData.userId, userReport.reporterUserId))
        .groupBy(sql`${userReport.reporterUserId}`),
      await ctx.drizzle
        .select({
          userId: userReportComment.userId,
          count: sql<number>`COUNT(${userReportComment.id})`.mapWith(Number),
          decision: userReportComment.decision,
        })
        .from(userReportComment)
        .groupBy(sql`${userReportComment.userId}, ${userReportComment.decision}`),
    ]);
    if (user.role === "USER") {
      throw serverError("UNAUTHORIZED", "You cannot view this page");
    }
    return { staff, timesReported, timesReporting, decisions };
  }),
  getModBotPerformance: protectedProcedure
    .input(z.object({ timeframe: z.enum(["daily", "weekly"]) }))
    .query(async ({ ctx, input }) => {
      // Query selector
      const selector =
        input.timeframe === "daily"
          ? {
              year: sql<number>`YEAR(CAST(${userReport.createdAt} AS DATE))`,
              time: sql<number>`DAYOFYEAR(CAST(${userReport.createdAt} AS DATE))`,
              count: sql<number>`COUNT(${userReport.id})`.mapWith(Number),
            }
          : {
              year: sql<number>`YEAR(CAST(${userReport.createdAt} AS DATE))`,
              time: sql<number>`WEEK(CAST(${userReport.createdAt} AS DATE))`,
              count: sql<number>`COUNT(${userReport.id})`.mapWith(Number),
            };
      // Where clause
      const whereClause =
        input.timeframe === "daily"
          ? sql`${userReport.createdAt} > CURRENT_TIMESTAMP() -  INTERVAL 30 DAY`
          : sql`${userReport.createdAt} > CURRENT_TIMESTAMP() -  INTERVAL 4 MONTH`;
      // Query
      const [user, totalUserReports, totalBotReports, botReports] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        await ctx.drizzle
          .select(selector)
          .from(userReport)
          .where(
            and(
              ne(userReport.reporterUserId, TERR_BOT_ID),
              ne(userReport.status, "UNVIEWED"),
              whereClause,
            ),
          )
          .groupBy(selector.year, selector.time),
        await ctx.drizzle
          .select(selector)
          .from(userReport)
          .where(
            and(
              eq(userReport.reporterUserId, TERR_BOT_ID),
              ne(userReport.status, "UNVIEWED"),
              ne(userReport.predictedStatus, "REPORT_CLEARED"),
              whereClause,
            ),
          )
          .groupBy(selector.year, selector.time),
        await ctx.drizzle
          .select({
            ...selector,
            status: userReport.status,
            predictedStatus: userReport.predictedStatus,
          })
          .from(userReport)
          .where(
            and(
              eq(userReport.reporterUserId, TERR_BOT_ID),
              ne(userReport.status, "UNVIEWED"),
              ne(userReport.predictedStatus, "REPORT_CLEARED"),
              whereClause,
            ),
          )
          .groupBy(
            selector.year,
            selector.time,
            userReport.status,
            userReport.predictedStatus,
          ),
      ]);
      if (user.role === "USER") {
        throw serverError("UNAUTHORIZED", "You cannot view this page");
      }
      return { totalUserReports, totalBotReports, botReports };
    }),
  getUserReports: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [user, reports] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userReport.findMany({
          where: and(
            eq(userReport.reportedUserId, input.userId),
            ne(userReport.status, "REPORT_CLEARED"),
          ),
          with: {
            reporterUser: {
              columns: {
                userId: true,
                username: true,
                avatar: true,
              },
            },
          },
        }),
      ]);
      // Guard
      if (!canSeeSecretData(user.role)) {
        throw serverError("UNAUTHORIZED", "You cannot view this user's reports");
      }
      // Return reports
      return reports;
    }),
  // Let moderators and higher see all reports, let users see reports associated with them
  getAll: protectedProcedure
    .input(
      reportFilteringSchema.extend({
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const reportedUser = alias(userData, "reportedUser");
      const reporterUser = alias(userData, "reporterUser");
      const staffUser = canModerateRoles.includes(user.role);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reporterUserId, ...rest } = getTableColumns(userReport);
      const reports = await ctx.drizzle
        .select({
          UserReport: !staffUser ? { ...rest } : getTableColumns(userReport),
          reportedUser: { ...getTableColumns(reportedUser) },
        })
        .from(userReport)
        .where(
          and(
            ...(input.system !== undefined
              ? [eq(userReport.system, input.system)]
              : []),
            ...(input.startDate !== undefined
              ? [gte(userReport.createdAt, new Date(input.startDate))]
              : []),
            ...(input.endDate !== undefined
              ? [lte(userReport.createdAt, new Date(input.endDate))]
              : []),
            ...(!staffUser
              ? [
                  and(
                    eq(userReport.reportedUserId, ctx.userId),
                    inArray(userReport.status, [
                      "BAN_ACTIVATED",
                      "OFFICIAL_WARNING",
                      "SILENCE_ACTIVATED",
                    ]),
                  ),
                ]
              : [eq(userReport.status, input.status)]),
          ),
        )
        .innerJoin(
          reportedUser,
          and(
            eq(reportedUser.userId, userReport.reportedUserId),
            ...(input.reportedUser !== undefined
              ? [like(reportedUser.username, `%${input.reportedUser}%`)]
              : []),
          ),
        )
        .leftJoin(
          reporterUser,
          and(
            eq(reporterUser.userId, userReport.reporterUserId),
            ...(input.reporterUser !== undefined
              ? [like(reporterUser.username, `%${input.reporterUser}%`)]
              : []),
          ),
        )
        .limit(input.limit)
        .orderBy(desc(userReport.updatedAt))
        .offset(skip);

      const nextCursor = reports.length < input.limit ? null : currentCursor + 1;
      return {
        data: reports,
        nextCursor: nextCursor,
      };
    }),
  // Get user report
  getBan: protectedProcedure.query(async ({ ctx }) => {
    // Selector statement
    const [user, banReport, silenceReport] = await Promise.all([
      fetchUser(ctx.drizzle, ctx.userId),
      ctx.drizzle.query.userReport.findFirst({
        where: and(
          eq(userReport.status, "BAN_ACTIVATED"),
          eq(userReport.reportedUserId, ctx.userId),
          gt(userReport.banEnd, new Date()),
        ),
        with: {
          reporterUser: {
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
          },
          reportedUser: {
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
          },
        },
      }),
      ctx.drizzle.query.userReport.findFirst({
        where: and(
          eq(userReport.status, "SILENCE_ACTIVATED"),
          eq(userReport.reportedUserId, ctx.userId),
          gt(userReport.banEnd, new Date()),
        ),
      }),
    ]);
    // Unsilence user if ban no longer active
    if (!silenceReport && user.isSilenced) {
      await ctx.drizzle
        .update(userData)
        .set({ isSilenced: false })
        .where(eq(userData.userId, ctx.userId));
    }
    // Unban user if ban no longer active
    if (!banReport && user.isBanned) {
      await ctx.drizzle
        .update(userData)
        .set({ isBanned: false })
        .where(eq(userData.userId, ctx.userId));
    }
    return banReport ?? null;
  }),
  // Get a single report
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.id, ctx.userId),
      ]);
      if (canSeeReport(user, report)) {
        const prevReports = canSeeSecretData(user.role)
          ? await getRelatedReports(ctx.drizzle, report.aiInterpretation)
          : [];
        return { report, prevReports };
      } else {
        throw serverError("UNAUTHORIZED", "You have no access to the report");
      }
    }),
  // Create a new user report
  create: protectedProcedure
    .input(userReportSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Fetch
      const getInfraction = async (system: typeof input.system) => {
        switch (system) {
          case "forum_comment":
            const forumPostData = await ctx.drizzle.query.forumPost.findFirst({
              where: eq(forumPost.id, input.system_id),
            });
            const threadContext = await getAdditionalContext(
              ctx.drizzle,
              system,
              forumPostData?.createdAt,
              forumPostData?.threadId,
            );
            await ctx.drizzle
              .update(forumPost)
              .set({ isReported: true })
              .where(eq(forumPost.id, input.system_id));
            return { infraction: forumPostData, context: threadContext };
          case "conversation_comment":
            const commentData = await ctx.drizzle.query.conversationComment.findFirst({
              where: eq(conversationComment.id, input.system_id),
            });
            const convoContext = await getAdditionalContext(
              ctx.drizzle,
              system,
              commentData?.createdAt,
              commentData?.conversationId,
            );
            await ctx.drizzle
              .update(conversationComment)
              .set({ isReported: true })
              .where(eq(conversationComment.id, input.system_id));
            return { infraction: commentData, context: convoContext };
          case "user_profile":
            return {
              infraction: await fetchUser(ctx.drizzle, input.system_id),
              context: [],
            };
          case "concept_art":
            return {
              infraction: await fetchImage(ctx.drizzle, input.system_id, ""),
              context: [],
            };
          default:
            throw serverError("INTERNAL_SERVER_ERROR", "Invalid report system");
        }
      };
      const [{ infraction, context }, { decision, aiInterpretation }] =
        await Promise.all([
          getInfraction(input.system),
          generateModerationDecision(ctx.drizzle, JSON.stringify(input)),
        ]);
      // Guard
      if (!infraction) return errorResponse("Infraction not found");
      if ("isReported" in infraction && infraction.isReported) {
        return errorResponse("This infraction has already been reported");
      }
      // Mutate
      await insertUserReport(ctx.drizzle, {
        userId: ctx.userId,
        reportedUserId: input.reported_userId,
        system: input.system,
        infraction: infraction,
        reason: input.reason,
        aiInterpretation: aiInterpretation,
        predictedStatus: decision.createReport,
        additionalContext: context,
      });
      // Return
      return {
        success: true,
        message: "Your report has been submitted. A moderator will review it asap.",
      };
    }),
  // Ban a user. If no escalation: moderator-only. If escalated: admin-only
  ban: protectedProcedure
    .input(reportCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      const hasModRights = canModerateReports(user, report);
      if (!hasModRights) return errorResponse("You cannot resolve this report");
      if (!input.banTime || input.banTime <= 0) {
        return errorResponse("Ban time must be specified.");
      }
      // Update
      await Promise.all([
        ...(report.reportedUserId
          ? [
              ctx.drizzle
                .update(userData)
                .set({ isBanned: true, status: "AWAKE", travelFinishAt: null })
                .where(eq(userData.userId, report.reportedUserId)),
            ]
          : []),
        ctx.drizzle
          .update(userReport)
          .set({
            status: "BAN_ACTIVATED",
            adminResolved: user.role.includes("ADMIN") ? 1 : 0,
            updatedAt: new Date(),
            banEnd: getBanEndDate(input),
          })
          .where(eq(userReport.id, input.object_id)),
        ctx.drizzle.insert(userReportComment).values({
          id: nanoid(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "BAN_ACTIVATED",
        }),
      ]);
      return { success: true, message: "User banned" };
    }),
  // Silence a user. If no escalation: moderator-only. If escalated: admin-only
  silence: protectedProcedure
    .input(reportCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      const hasModRights = canModerateReports(user, report);
      if (!hasModRights) return errorResponse("You cannot resolve this report");
      if (!input.banTime || input.banTime <= 0) {
        return errorResponse("Ban time must be specified.");
      }
      // Update
      await Promise.all([
        ...(report.reportedUserId
          ? [
              ctx.drizzle
                .update(userData)
                .set({ isSilenced: true, status: "AWAKE" })
                .where(eq(userData.userId, report.reportedUserId)),
            ]
          : []),
        ctx.drizzle
          .update(userReport)
          .set({
            status: "SILENCE_ACTIVATED",
            adminResolved: user.role.includes("ADMIN") ? 1 : 0,
            updatedAt: new Date(),
            banEnd: getBanEndDate(input),
          })
          .where(eq(userReport.id, input.object_id)),
        ctx.drizzle.insert(userReportComment).values({
          id: nanoid(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "SILENCE_ACTIVATED",
        }),
      ]);
      return { success: true, message: "User silenced" };
    }),
  // Issue warning to user
  warn: protectedProcedure
    .input(reportCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      const hasModRights = canModerateReports(user, report);
      if (!hasModRights) return errorResponse("No permission to warn");
      // Update
      await Promise.all([
        ctx.drizzle
          .update(userReport)
          .set({
            status: "OFFICIAL_WARNING",
            adminResolved: user.role.includes("ADMIN") ? 1 : 0,
            updatedAt: new Date(),
            banEnd: null,
          })
          .where(eq(userReport.id, input.object_id)),
        ctx.drizzle.insert(userReportComment).values({
          id: nanoid(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "OFFICIAL_WARNING",
        }),
      ]);
      if (report.reportedUserId) {
        void pusher.trigger(report.reportedUserId, "event", {
          type: "userMessage",
          message: `You have been given a warning`,
          route: "/reports",
          routeText: "To Report",
        });
      }
      return { success: true, message: "User warned" };
    }),
  // Escalate a report to admin. Only if already banned, and no previous escalation
  escalate: protectedProcedure
    .input(reportCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      if (canEscalateBan(user, report)) return errorResponse("You cannot escalate");
      // Update
      await Promise.all([
        ctx.drizzle
          .update(userReport)
          .set({ status: "BAN_ESCALATED", updatedAt: new Date() })
          .where(eq(userReport.id, input.object_id)),
        ctx.drizzle.insert(userReportComment).values({
          id: nanoid(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "BAN_ESCALATED",
        }),
      ]);
      return { success: true, message: "Report escalated" };
    }),
  clear: protectedProcedure
    .input(reportCommentSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, report] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUserReport(ctx.drizzle, input.object_id, ctx.userId),
      ]);
      // Guard
      if (!canClearReport(user, report)) return errorResponse("No permission");
      // If someone was reported
      if (report.reportedUserId) {
        // Remove ban if no other active bans
        const bans = await ctx.drizzle.query.userReport.findMany({
          where: and(
            eq(userReport.reportedUserId, report.reportedUserId ?? ""),
            eq(userReport.status, "BAN_ACTIVATED"),
            gte(userReport.banEnd, new Date()),
            ne(userReport.id, report.id),
          ),
        });
        if (bans.length === 0) {
          await ctx.drizzle
            .update(userData)
            .set({ isBanned: false })
            .where(eq(userData.userId, report.reportedUserId));
        }
        // Remove silence if no other active bans
        const silences = await ctx.drizzle.query.userReport.findMany({
          where: and(
            eq(userReport.reportedUserId, report.reportedUserId ?? ""),
            eq(userReport.status, "SILENCE_ACTIVATED"),
            gte(userReport.banEnd, new Date()),
            ne(userReport.id, report.id),
          ),
        });
        if (silences.length === 0) {
          await ctx.drizzle
            .update(userData)
            .set({ isSilenced: false })
            .where(eq(userData.userId, report.reportedUserId));
        }
      }
      // Update report
      await Promise.all([
        ctx.drizzle
          .update(userReport)
          .set({
            adminResolved: user.role.includes("ADMIN") ? 1 : 0,
            status: "REPORT_CLEARED",
            updatedAt: new Date(),
          })
          .where(eq(userReport.id, report.id)),
        ctx.drizzle.insert(userReportComment).values({
          id: nanoid(),
          userId: ctx.userId,
          reportId: report.id,
          content: sanitize(input.comment),
          decision: "REPORT_CLEARED",
        }),
      ]);
      return { success: true, message: "Report cleared" };
    }),
  updateUserAvatar: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, target] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
      ]);
      // Guard
      if (!canClearUserNindo(user)) return errorResponse("You cannot clear nindos");
      // Mutate
      void requestAvatarForUser(ctx.drizzle, target);
      await Promise.all([
        ctx.drizzle.insert(reportLog).values({
          id: nanoid(),
          staffUserId: ctx.userId,
          action: "AVATAR_CHANGE",
          targetUserId: input.userId,
        }),
        ctx.drizzle
          .update(userData)
          .set({ avatar: null, avatarLight: null })
          .where(eq(userData.userId, input.userId)),
      ]);
      return { success: true, message: "Avatar update request sent" };
    }),
  clearNindo: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, target] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.userId),
      ]);
      // Guard
      if (!canClearUserNindo(user)) return errorResponse("You cannot clear nindos");
      // Mutate
      await Promise.all([
        ctx.drizzle.insert(reportLog).values({
          id: nanoid(),
          staffUserId: ctx.userId,
          action: "NINDO_CLEARED",
          targetUserId: input.userId,
        }),
        ctx.drizzle.delete(userNindo).where(eq(userNindo.userId, target.userId)),
      ]);
      return { success: true, message: "Nindo cleared" };
    }),
  getUserStaffReviews: protectedProcedure.query(async ({ ctx }) => {
    return await ctx.drizzle.query.userReview.findMany({
      where: eq(userReview.authorUserId, ctx.userId),
    });
  }),
  upsertStaffReview: protectedProcedure
    .input(userReviewSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      // Query
      const [user, target, review] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        fetchUser(ctx.drizzle, input.staffUserId),
        ctx.drizzle.query.userReview.findFirst({
          where: and(
            eq(userReview.targetUserId, input.staffUserId),
            eq(userReview.authorUserId, ctx.userId),
          ),
        }),
      ]);
      // Guard
      if (user.isBanned) return errorResponse("You are banned and cannot post reviews");
      if (target.role === "USER") return errorResponse("You cannot review users");
      // Mutate
      if (review) {
        await ctx.drizzle
          .update(userReview)
          .set({
            positive: input.positive,
            review: input.review,
            createdAt: new Date(),
          })
          .where(eq(userReview.id, review.id));
        return { success: true, message: "Staff review updated" };
      } else {
        await ctx.drizzle.insert(userReview).values({
          id: nanoid(),
          targetUserId: input.staffUserId,
          authorUserId: ctx.userId,
          authorIp: ctx.userIp ?? "unknown",
          positive: input.positive,
          review: input.review,
        });
        return { success: true, message: "Staff review created" };
      }
    }),
});

export const fetchUserReport = async (
  client: DrizzleClient,
  userReportId: string,
  fetcherUserId: string,
) => {
  const entry = await client.query.userReport.findFirst({
    where: eq(userReport.id, userReportId),
    with: {
      reporterUser: {
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
      },
      reportedUser: {
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
      },
    },
  });
  if (!entry) {
    throw new Error("Report not found");
  }
  if (fetcherUserId === entry.reportedUserId) {
    entry.reporterUser = null;
    entry.reporterUserId = null;
  }
  return entry;
};

export const getBanEndDate = (input: ReportCommentSchema) => {
  return input.banTime !== undefined && input.banTimeUnit !== undefined
    ? new Date(
        new Date().getTime() +
          input.banTime * getMillisecondsFromTimeUnit(input.banTimeUnit),
      )
    : null;
};

export const insertUserReport = async (
  client: DrizzleClient,
  info: {
    userId: string;
    reportedUserId: string;
    system: string;
    infraction: unknown;
    additionalContext: AdditionalContext[];
    reason: string;
    aiInterpretation: string;
    predictedStatus: BanState;
  },
) => {
  await client.insert(userReport).values({
    id: nanoid(),
    reporterUserId: info.userId,
    reportedUserId: info.reportedUserId,
    system: info.system,
    infraction: info.infraction,
    aiInterpretation: info.aiInterpretation,
    reason: sanitize(info.reason),
    predictedStatus: info.predictedStatus,
    additionalContext: info.additionalContext,
  });
};
