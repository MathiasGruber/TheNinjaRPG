import { z } from "zod";
import { nanoid } from "nanoid";
import { alias } from "drizzle-orm/mysql-core";
import { getTableColumns, sql } from "drizzle-orm";
import { eq, and, gte, ne, gt, like, notInArray, inArray, desc } from "drizzle-orm";
import { reportLog } from "@/drizzle/schema";
import { forumPost, conversationComment, userNindo } from "@/drizzle/schema";
import { userReport, userReportComment, userData } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { serverError, baseServerResponse, errorResponse } from "../trpc";
import { userReportSchema } from "@/validators/reports";
import { reportCommentSchema } from "@/validators/reports";
import { updateAvatar } from "../../../libs/replicate";
import { canModerateReports } from "@/validators/reports";
import { canSeeReport } from "@/validators/reports";
import { canClearReport } from "@/validators/reports";
import { canEscalateBan } from "@/validators/reports";
import { canChangePublicUser } from "@/validators/reports";
import { fetchUser } from "./profile";
import { fetchImage } from "./conceptart";
import { canSeeSecretData } from "@/utils/permissions";
import { getServerPusher } from "@/libs/pusher";
import { getMillisecondsFromTimeUnit } from "@/utils/time";
import sanitize from "@/utils/sanitize";
import type { ReportCommentSchema } from "@/validators/reports";
import type { DrizzleClient } from "../../db";

const pusher = getServerPusher();

export const reportsRouter = createTRPCRouter({
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
  getUserReports: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Query
      const [user, reports] = await Promise.all([
        fetchUser(ctx.drizzle, ctx.userId),
        ctx.drizzle.query.userReport.findMany({
          where: eq(userReport.reportedUserId, input.userId),
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
      z.object({
        isUnhandled: z.boolean().optional(),
        showAll: z.boolean().optional(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
        username: z
          .string()
          .regex(new RegExp("^[a-zA-Z0-9_]+$"), {
            message: "Must only contain alphanumeric characters and no spaces",
          })
          .optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const reportedUser = alias(userData, "reportedUser");
      // If user, then only show handled reports
      const isUnhandled = user.role === "USER" ? false : input.isUnhandled;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { reporterUserId, ...rest } = getTableColumns(userReport);
      const reports = await ctx.drizzle
        .select({
          UserReport: { ...rest },
          reportedUser: { ...getTableColumns(reportedUser) },
        })
        .from(userReport)
        .where(
          and(
            // Handled or not
            isUnhandled
              ? inArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"])
              : notInArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"]),
            // Active or Closed
            ...(isUnhandled || input.showAll
              ? []
              : [inArray(userReport.status, ["BAN_ACTIVATED", "OFFICIAL_WARNING"])]),
            // Pertaining to user (if user)
            ...(user.role === "USER"
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
              : []),
          ),
        )
        .innerJoin(
          reportedUser,
          and(
            eq(reportedUser.userId, userReport.reportedUserId),
            ...(input.username !== undefined
              ? [like(reportedUser.username, `%${input.username}%`)]
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
    const report = await ctx.drizzle.query.userReport.findFirst({
      where: and(
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
    });
    return report ?? null;
  }),
  // Get a single report
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.id, ctx.userId);
      if (canSeeReport(user, report)) {
        return report;
      } else {
        throw serverError("UNAUTHORIZED", "You have no access to the report");
      }
    }),
  // Create a new user report
  create: protectedProcedure
    .input(userReportSchema)
    .output(baseServerResponse)
    .mutation(async ({ ctx, input }) => {
      const getInfraction = (system: typeof input.system) => {
        switch (system) {
          case "forum_comment":
            return ctx.drizzle.query.forumPost.findFirst({
              where: eq(forumPost.id, input.system_id),
            });
          case "conversation_comment":
            return ctx.drizzle.query.conversationComment.findFirst({
              where: eq(conversationComment.id, input.system_id),
            });
          case "user_profile":
            return fetchUser(ctx.drizzle, input.system_id);
          case "concept_art":
            return fetchImage(ctx.drizzle, input.system_id, "");
          default:
            throw serverError("INTERNAL_SERVER_ERROR", "Invalid report system");
        }
      };
      await getInfraction(input.system).then((report) => {
        if (report) {
          return ctx.drizzle.insert(userReport).values({
            id: nanoid(),
            reporterUserId: ctx.userId,
            reportedUserId: input.reported_userId,
            system: input.system,
            infraction: report,
            reason: sanitize(input.reason),
          });
        } else {
          throw serverError("NOT_FOUND", "Infraction not found.");
        }
      });
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
            adminResolved: user.role === "ADMIN" ? 1 : 0,
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
            adminResolved: user.role === "ADMIN" ? 1 : 0,
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
            adminResolved: user.role === "ADMIN" ? 1 : 0,
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
            eq(userReport.reportedUserId, report.reportedUserId),
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
            eq(userReport.reportedUserId, report.reportedUserId),
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
            adminResolved: user.role === "ADMIN" ? 1 : 0,
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
      if (!canChangePublicUser(user)) return errorResponse("You cannot clear nindos");
      // Mutate
      void updateAvatar(ctx.drizzle, target);
      await Promise.all([
        ctx.drizzle.insert(reportLog).values({
          id: nanoid(),
          staffUserId: ctx.userId,
          action: "AVATAR_CHANGE",
          targetUserId: input.userId,
        }),
        ctx.drizzle
          .update(userData)
          .set({ avatar: null })
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
      if (!canChangePublicUser(user)) return errorResponse("You cannot clear nindos");
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
