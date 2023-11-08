import { z } from "zod";
import { nanoid } from "nanoid";
import { alias } from "drizzle-orm/mysql-core";
import { eq, or, and, gte, ne, like, notInArray, inArray } from "drizzle-orm";
import { reportLog } from "@/drizzle/schema";
import { forumPost, conversationComment } from "@/drizzle/schema";
import { userReport, userReportComment, userData } from "@/drizzle/schema";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { userReportSchema } from "@/validators/reports";
import { reportCommentSchema } from "@/validators/reports";
import { updateAvatar } from "../../../libs/replicate";
import { canModerateReports } from "@/validators/reports";
import { canSeeReport } from "@/validators/reports";
import { canClearReport } from "@/validators/reports";
import { canEscalateBan } from "@/validators/reports";
import { canChangeAvatar } from "@/validators/reports";
import { fetchUser } from "./profile";
import type { DrizzleClient } from "../../db";
import sanitize from "@/utils/sanitize";

export const reportsRouter = createTRPCRouter({
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
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const reportedUser = alias(userData, "reportedUser");
      const reports = await ctx.drizzle
        .select()
        .from(userReport)
        .where(
          and(
            // Handled or not
            input.isUnhandled !== undefined && input.isUnhandled === true
              ? inArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"])
              : notInArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"]),
            // Active or Closed
            ...(input.showAll !== undefined && input.showAll === true
              ? []
              : [eq(userReport.status, "BAN_ACTIVATED")]),
            // Pertaining to user (if user)
            ...(user.role === "USER"
              ? [
                  or(
                    eq(userReport.reportedUserId, ctx.userId),
                    eq(userReport.reporterUserId, ctx.userId)
                  ),
                ]
              : [])
          )
        )
        .innerJoin(
          reportedUser,
          and(
            eq(reportedUser.userId, userReport.reportedUserId),
            ...(input.username !== undefined
              ? [like(reportedUser.username, `%${input.username}%`)]
              : [])
          )
        )
        .limit(input.limit)
        .offset(skip);
      const nextCursor = reports.length < input.limit ? null : currentCursor + 1;
      return {
        data: reports,
        nextCursor: nextCursor,
      };
    }),
  // Get a single report
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.id);
      if (canSeeReport(user, report)) {
        return report;
      } else {
        throw serverError("UNAUTHORIZED", "You have no access to the report");
      }
    }),
  // Create a new user report
  create: protectedProcedure
    .input(userReportSchema)
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
    }),
  // Ban a user. If no escalation: moderator-only. If escalated: admin-only
  ban: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.object_id);
      const hasModRights = canModerateReports(user, report);
      if (!input.banTime || input.banTime <= 0) {
        throw serverError("BAD_REQUEST", "Ban time must be specified.");
      }
      if (!hasModRights) {
        throw serverError("UNAUTHORIZED", "You cannot resolve this report");
      }

      if (report.reportedUserId) {
        await ctx.drizzle
          .update(userData)
          .set({ isBanned: 1 })
          .where(eq(userData.userId, report.reportedUserId));
      }
      await ctx.drizzle
        .update(userReport)
        .set({
          status: "BAN_ACTIVATED",
          adminResolved: user.role === "ADMIN" ? 1 : 0,
          banEnd:
            input.banTime !== undefined
              ? new Date(new Date().getTime() + input.banTime * 24 * 60 * 60 * 1000)
              : null,
        })
        .where(eq(userReport.id, input.object_id));
      await ctx.drizzle.insert(userReportComment).values({
        id: nanoid(),
        userId: ctx.userId,
        reportId: input.object_id,
        content: sanitize(input.comment),
        decision: "BAN_ACTIVATED",
      });
    }),
  // Escalate a report to admin. Only if already banned, and no previous escalation
  escalate: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.object_id);
      if (canEscalateBan(user, report)) {
        throw serverError("UNAUTHORIZED", "This ban cannot be escalated");
      }
      await ctx.drizzle
        .update(userReport)
        .set({ status: "BAN_ESCALATED" })
        .where(eq(userReport.id, input.object_id));
      await ctx.drizzle.insert(userReportComment).values({
        id: nanoid(),
        userId: ctx.userId,
        reportId: input.object_id,
        content: sanitize(input.comment),
        decision: "BAN_ESCALATED",
      });
    }),
  clear: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      const report = await fetchUserReport(ctx.drizzle, input.object_id);
      if (!canClearReport(user, report)) {
        throw serverError("UNAUTHORIZED", "You cannot clear this report");
      }

      if (report.reportedUserId) {
        const reports = await ctx.drizzle.query.userReport.findMany({
          where: and(
            eq(userReport.reportedUserId, report.reportedUserId),
            eq(userReport.status, "BAN_ACTIVATED"),
            gte(userReport.banEnd, new Date()),
            ne(userReport.id, report.id)
          ),
        });
        if (reports.length === 0) {
          await ctx.drizzle
            .update(userData)
            .set({ isBanned: 0 })
            .where(eq(userData.userId, report.reportedUserId));
        }
      }
      await ctx.drizzle
        .update(userReport)
        .set({
          adminResolved: user.role === "ADMIN" ? 1 : 0,
          status: "REPORT_CLEARED",
        })
        .where(eq(userReport.id, report.id));
      await ctx.drizzle.insert(userReportComment).values({
        id: nanoid(),
        userId: ctx.userId,
        reportId: report.id,
        content: sanitize(input.comment),
        decision: "REPORT_CLEARED",
      });
    }),
  updateUserAvatar: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeAvatar(user)) {
        const target = await fetchUser(ctx.drizzle, input.userId);
        void updateAvatar(ctx.drizzle, target);
        await ctx.drizzle.insert(reportLog).values({
          id: nanoid(),
          staffUserId: ctx.userId,
          action: "AVATAR_CHANGE",
          targetUserId: input.userId,
        });
        return await ctx.drizzle
          .update(userData)
          .set({ avatar: null })
          .where(eq(userData.userId, input.userId));
      } else {
        throw serverError("UNAUTHORIZED", "You cannot avatars");
      }
    }),
});

export const fetchUserReport = async (client: DrizzleClient, userReportId: string) => {
  const entry = await client.query.userReport.findFirst({
    where: eq(userReport.id, userReportId),
    with: {
      reporterUser: {
        columns: {
          userId: true,
          username: true,
          avatar: true,
          rank: true,
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
  return entry;
};
