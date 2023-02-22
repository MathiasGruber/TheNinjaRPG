import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { type Prisma } from "@prisma/client";
import sanitize from "../../../utils/sanitize";

export const systems = [
  "bug_report",
  "bug_comment",
  "forum_port",
  "tavern_post",
] as const;

export const reportsRouter = createTRPCRouter({
  // Let moderators and higher see all reports, let users see reports associated with them
  getAll: protectedProcedure
    .input(
      z.object({
        is_active: z.boolean(),
        cursor: z.number().nullish(),
        limit: z.number().min(1).max(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const currentCursor = input.cursor ? input.cursor : 0;
      const skip = currentCursor * input.limit;
      const reports = await ctx.prisma.userReport.findMany({
        skip: skip,
        take: input.limit,
        where: {
          is_resolved: !input.is_active,
          ...(ctx.session.user.role === "USER"
            ? {
                OR: [
                  { reportedUserId: ctx.session.user.id },
                  { reporterUserId: ctx.session.user.id },
                ],
              }
            : {}),
        },
        include: {
          reporterUser: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
          reportedUser: {
            select: {
              username: true,
              avatar: true,
              rank: true,
              level: true,
            },
          },
        },
        orderBy: [
          {
            createdAt: "desc",
          },
        ],
      });
      const nextCursor =
        reports.length < input.limit ? null : currentCursor + 1;
      return {
        data: reports,
        nextCursor: nextCursor,
      };
    }),
  // Create a new user report
  create: protectedProcedure
    .input(
      z.object({
        system: z.enum(systems),
        system_id: z.string().cuid(),
        reported_userId: z.string().cuid(),
        reportReason: z.string().min(1).max(1000),
      })
    )
    .mutation(({ ctx, input }) => {
      const getReport = (system: typeof input.system) => {
        switch (system) {
          case "bug_report":
            return ctx.prisma.bugReport.findUnique({
              where: { id: input.system_id },
            });
          case "bug_comment":
            return ctx.prisma.bugComment.findUnique({
              where: { id: input.system_id },
            });
          default:
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Invalid report system.",
            });
        }
      };
      return ctx.prisma.userReport.create({
        data: {
          reporterUserId: ctx.session.user.id,
          reportedUserId: input.reported_userId,
          system: input.system,
          infraction: getReport(input.system) as unknown as Prisma.JsonArray,
          reportReason: sanitize(input.reportReason),
        },
      });
    }),
  // Create a new comment on a given UserReport
  createComment: protectedProcedure
    .input(
      z.object({
        report_id: z.string().cuid(),
        comment: z.string().min(1).max(1000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.prisma.userReport.findUnique({
        where: { id: input.report_id },
      });
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found.",
        });
      }
      if (report.is_resolved) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This report has already been resolved",
        });
      }
      if (
        report.reporterUserId === ctx.session.user.id ||
        report.reportedUserId === ctx.session.user.id ||
        ["MODERATOR", "ADMIN"].includes(ctx.session.user.role)
      ) {
        return ctx.prisma.userReportComment.create({
          data: {
            userId: ctx.session.user.id,
            reportId: input.report_id,
            content: sanitize(input.comment),
          },
        });
      } else {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You do not have access to the report",
        });
      }
    }),
  // Resolve a given UserReport
  resolve: protectedProcedure
    .input(
      z.object({
        report_id: z.string().cuid(),
        is_resolved: z.boolean(),
        reasoning: z.string().min(1).max(1000),
        banEnd: z.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const report = await ctx.prisma.userReport.findUnique({
        where: { id: input.report_id },
      });
      if (!report) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Report not found.",
        });
      }
      if (
        report.reporterUserId === ctx.session.user.id ||
        ["MODERATOR", "ADMIN"].includes(ctx.session.user.role)
      ) {
        await ctx.prisma.$transaction(async (tx) => {
          // If a ban time, set the user as banned
          if (input.banEnd && report.reportedUserId) {
            await tx.userData.update({
              where: { userId: report.reportedUserId },
              data: {
                isBanned: true,
              },
            });
          }
          // Update the report
          await tx.userReport.update({
            where: { id: input.report_id },
            data: {
              is_resolved: input.is_resolved,
              banEnd: input.banEnd,
            },
          });
          // Create a new comment with resolve reason
          await tx.userReportComment.create({
            data: {
              userId: ctx.session.user.id,
              reportId: input.report_id,
              content: sanitize(input.reasoning),
            },
          });
        });
      } else {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "You do not have access to the report",
        });
      }
    }),
});
