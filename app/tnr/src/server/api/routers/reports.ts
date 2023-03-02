import { z } from "zod";
import { createTRPCRouter, protectedProcedure, serverError } from "../trpc";
import { type Prisma } from "@prisma/client";
import { type PrismaClient } from "@prisma/client";
import { userReportSchema } from "../../../validators/reports";
import { reportCommentSchema } from "../../../validators/reports";
import { ReportAction } from "@prisma/client";
import sanitize from "../../../utils/sanitize";
import { canModerateReports } from "../../../validators/reports";
import { canSeeReport } from "../../../validators/reports";
import { canEscalateBan } from "../../../validators/reports";

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
      const reports = await ctx.prisma.userReport.findMany({
        skip: skip,
        take: input.limit,
        where: {
          // if is_active is not undefined, then filter on active/inactive, otherwise do nothing
          ...(input.is_active !== undefined
            ? input.is_active
              ? {
                  status: {
                    in: [ReportAction.UNVIEWED, ReportAction.BAN_ESCALATED],
                  },
                }
              : {
                  status: {
                    notIn: [ReportAction.UNVIEWED, ReportAction.BAN_ESCALATED],
                  },
                }
            : {}),
          // Subset on user reports if user is not a moderator
          ...(ctx.session.user.role === "USER"
            ? {
                OR: [
                  { reportedUserId: ctx.session.user.id },
                  { reporterUserId: ctx.session.user.id },
                ],
              }
            : {}),
          // Subset on username if provided
          ...(input.username !== undefined
            ? {
                reportedUser: {
                  username: {
                    contains: input.username,
                  },
                },
              }
            : {}),
        },
        ...getIncludes,
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      });
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
      const report = await fetchUserReport(ctx.prisma, input.id);
      if (canSeeReport(ctx.session.user, report)) {
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
            return ctx.prisma.bugReport.findUnique({
              where: { id: input.system_id },
            });
          case "bug_comment":
            return ctx.prisma.bugComment.findUnique({
              where: { id: input.system_id },
            });
          case "forum_comment":
            return ctx.prisma.forumPost.findUnique({
              where: { id: input.system_id },
            });
          default:
            throw serverError("INTERNAL_SERVER_ERROR", "Invalid report system");
        }
      };
      await getInfraction(input.system).then((report) => {
        console.log("====================================");
        console.log(report);
        console.log("====================================");
        if (report) {
          return ctx.prisma.userReport.create({
            data: {
              reporterUserId: ctx.session.user.id,
              reportedUserId: input.reported_userId,
              system: input.system,
              infraction: report as unknown as Prisma.JsonObject,
              reason: sanitize(input.reason),
            },
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
      // Guards
      const user = ctx.session.user;
      const report = await fetchUserReport(ctx.prisma, input.object_id);
      const hasModRights = canModerateReports(user, report);
      if (!input.banTime || input.banTime <= 0) {
        throw serverError("BAD_REQUEST", "Ban time must be specified.");
      }
      if (!hasModRights) {
        throw serverError("UNAUTHORIZED", "You cannot resolve this report");
      }
      // Perform the ban
      await ctx.prisma.$transaction(async (tx) => {
        if (report.reportedUserId) {
          await tx.user.update({
            where: { id: report.reportedUserId },
            data: {
              isBanned: true,
            },
          });
        }
        await tx.userReport.update({
          where: { id: input.object_id },
          data: {
            status: ReportAction.BAN_ACTIVATED,
            adminResolved: ctx.session.user.role === "ADMIN",
            banEnd:
              input.banTime !== undefined
                ? new Date(new Date().getTime() + input.banTime * 24 * 60 * 60 * 1000)
                : undefined,
          },
        });
        await tx.userReportComment.create({
          data: {
            userId: ctx.session.user.id,
            reportId: input.object_id,
            content: sanitize(input.comment),
            decision: ReportAction.BAN_ACTIVATED,
          },
        });
      });
    }),
  // Escalate a report to admin. Only if already banned, and no previous escalation
  escalate: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Guards
      const report = await fetchUserReport(ctx.prisma, input.object_id);
      if (canEscalateBan(ctx.session.user, report)) {
        throw serverError("UNAUTHORIZED", "User can escalate ban once.");
      }
      // Perform the escalation
      await ctx.prisma.$transaction(async (tx) => {
        await tx.userReport.update({
          where: { id: input.object_id },
          data: {
            status: ReportAction.BAN_ESCALATED,
          },
        });
        await tx.userReportComment.create({
          data: {
            userId: ctx.session.user.id,
            reportId: input.object_id,
            content: sanitize(input.comment),
            decision: ReportAction.BAN_ESCALATED,
          },
        });
      });
    }),
  clear: protectedProcedure
    .input(reportCommentSchema)
    .mutation(async ({ ctx, input }) => {
      // Guards
      const report = await fetchUserReport(ctx.prisma, input.object_id);
      // Perform the clear
      await ctx.prisma.$transaction(async (tx) => {
        // If there are other reports where ban is active, do not clear ban. Otherwise do
        if (report.reportedUserId) {
          const reports = await tx.userReport.findMany({
            where: {
              reportedUserId: report.reportedUserId,
              status: ReportAction.BAN_ACTIVATED,
              banEnd: { gte: new Date() },
              NOT: { id: report.id },
            },
          });
          if (reports.length === 0) {
            await tx.user.update({
              where: { id: report.reportedUserId },
              data: {
                isBanned: false,
              },
            });
          }
        }
        await tx.userReport.update({
          where: { id: report.id },
          data: {
            adminResolved: ctx.session.user.role === "ADMIN",
            status: ReportAction.REPORT_CLEARED,
          },
        });
        await tx.userReportComment.create({
          data: {
            userId: ctx.session.user.id,
            reportId: report.id,
            content: sanitize(input.comment),
            decision: ReportAction.REPORT_CLEARED,
          },
        });
      });
    }),
});

/**
 * Fetches the user report in question. Throws an error if not found.
 */
export const fetchUserReport = async (client: PrismaClient, id: string) => {
  const report = await client.userReport.findUniqueOrThrow({
    where: { id },
    ...getIncludes,
  });
  return report;
};

/**
 * Includes to be used for queries against reports
 */
const getIncludes = {
  include: {
    reporterUser: {
      select: {
        userId: true,
        username: true,
        avatar: true,
        rank: true,
        level: true,
      },
    },
    reportedUser: {
      select: {
        userId: true,
        username: true,
        avatar: true,
        rank: true,
        level: true,
      },
    },
  },
};
