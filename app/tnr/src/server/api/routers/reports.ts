import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { alias } from "drizzle-orm/mysql-core";
import { eq, or, and, sql, gte, ne, ilike, notInArray, inArray } from "drizzle-orm";
import { reportLog } from "../../../../drizzle/schema";
import { bugReport, forumPost, conversationComment } from "../../../../drizzle/schema";
import { userReport, userReportComment, userData } from "../../../../drizzle/schema";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { userReportSchema } from "../../../validators/reports";
import { reportCommentSchema } from "../../../validators/reports";
import { updateAvatar } from "../../../libs/replicate";
import { canModerateReports } from "../../../validators/reports";
import { canSeeReport } from "../../../validators/reports";
import { canClearReport } from "../../../validators/reports";
import { canEscalateBan } from "../../../validators/reports";
import { canChangeAvatar } from "../../../validators/reports";
import { fetchUser } from "./profile";
import type { DrizzleClient } from "../../db";
import sanitize from "../../../utils/sanitize";

export const reportsRouter = createTRPCRouter({
  // Let moderators and higher see all reports, let users see reports associated with them
  getAll: protectedProcedure
    .input(
      z.object({
        is_active: z.boolean().optional(),
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
      const reports = await ctx.drizzle
        .select()
        .from(userReport)
        .where(
          and(
            input.is_active !== undefined
              ? inArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"])
              : notInArray(userReport.status, ["UNVIEWED", "BAN_ESCALATED"]),
            user.role === "USER"
              ? or(
                  eq(userReport.reportedUserId, ctx.userId),
                  eq(userReport.reporterUserId, ctx.userId)
                )
              : sql``
          )
        )
        .innerJoin(
          alias(userData, "reportedUser"),
          and(
            eq(userData.userId, userReport.reportedUserId),
            input.username !== undefined
              ? ilike(userData.username, input.username)
              : sql``
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
    .input(z.object({ id: z.string().cuid() }))
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
          case "bug_report":
            return ctx.drizzle.query.bugReport.findFirst({
              where: eq(bugReport.id, input.system_id),
            });
          case "forum_comment":
            return ctx.drizzle.query.forumPost.findFirst({
              where: eq(forumPost.id, input.system_id),
            });
          case "conversation_comment":
            return ctx.drizzle.query.conversationComment.findFirst({
              where: eq(conversationComment.id, input.system_id),
            });
          default:
            throw serverError("INTERNAL_SERVER_ERROR", "Invalid report system");
        }
      };
      await getInfraction(input.system).then((report) => {
        if (report) {
          return ctx.drizzle.insert(userReport).values({
            id: createId(),
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
      await ctx.drizzle.transaction(async (tx) => {
        if (report.reportedUserId) {
          await tx
            .update(userData)
            .set({ isBanned: 1 })
            .where(eq(userData.userId, report.reportedUserId));
        }
        await tx
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
        await tx.insert(userReportComment).values({
          id: createId(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "BAN_ACTIVATED",
        });
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
      await ctx.drizzle.transaction(async (tx) => {
        await tx
          .update(userReport)
          .set({ status: "BAN_ESCALATED" })
          .where(eq(userReport.id, input.object_id));
        await tx.insert(userReportComment).values({
          id: createId(),
          userId: ctx.userId,
          reportId: input.object_id,
          content: sanitize(input.comment),
          decision: "BAN_ESCALATED",
        });
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
      await ctx.drizzle.transaction(async (tx) => {
        if (report.reportedUserId) {
          const reports = await tx.query.userReport.findMany({
            where: and(
              eq(userReport.reportedUserId, report.reportedUserId),
              eq(userReport.status, "BAN_ACTIVATED"),
              gte(userReport.banEnd, new Date()),
              ne(userReport.id, report.id)
            ),
          });
          if (reports.length === 0) {
            await tx
              .update(userData)
              .set({ isBanned: 0 })
              .where(eq(userData.userId, report.reportedUserId));
          }
        }
        await tx
          .update(userReport)
          .set({
            adminResolved: user.role === "ADMIN" ? 1 : 0,
            status: "REPORT_CLEARED",
          })
          .where(eq(userReport.id, report.id));
        await tx.insert(userReportComment).values({
          id: createId(),
          userId: ctx.userId,
          reportId: report.id,
          content: sanitize(input.comment),
          decision: "REPORT_CLEARED",
        });
      });
    }),
  updateUserAvatar: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await fetchUser(ctx.drizzle, ctx.userId);
      if (canChangeAvatar(user)) {
        void updateAvatar(ctx.drizzle, user);
        await ctx.drizzle.insert(reportLog).values({
          id: createId(),
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
      ...userReportUserDataSelect,
    },
  });
  if (!entry) {
    throw new Error("Report not found");
  }
  return entry;
};

const userReportUserDataSelect = {
  reporterUser: {
    columns: {
      userId: true,
      username: true,
      avatar: true,
      rank: true,
      level: true,
    },
  },
  reportedUser: {
    columns: {
      userId: true,
      username: true,
      avatar: true,
      rank: true,
      level: true,
    },
  },
};
