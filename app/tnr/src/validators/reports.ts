import { z } from "zod";
import { ReportAction } from "@prisma/client";
import { type UserReport } from "@prisma/client";

export const systems = [
  "bug_report",
  "bug_comment",
  "forum_comment",
  "tavern_comment",
  "conversation_comment",
] as const;

export const userReportSchema = z.object({
  system: z.enum(systems),
  system_id: z.string().cuid(),
  reported_userId: z.string().cuid(),
  reason: z.string().min(1).max(1000),
});

export type UserReportSchema = z.infer<typeof userReportSchema>;

export const reportCommentSchema = z.object({
  comment: z.string().min(10).max(1000),
  object_id: z.string().cuid(),
  banTime: z.number().min(0).max(365),
});

export type ReportCommentSchema = z.infer<typeof reportCommentSchema>;

interface PermUser {
  id: string;
  role: string;
}

/**
 * Whether a user can see a given report based on his role & userId
 */
export const canSeeReport = (user: PermUser, report: UserReport) => {
  return (
    report.reporterUserId === user.id ||
    report.reportedUserId === user.id ||
    ["MODERATOR", "ADMIN"].includes(user.role)
  );
};

/**
 * Depending on status of the report, we allow or disallow posting comments
 */
export const canPostReportComment = (report: UserReport) => {
  return ["UNVIEWED", "BAN_ESCALATED"].includes(report.status);
};

/**
 * Which user roles have access to moderate reports
 */
export const canModerateReports = (user: PermUser, report: UserReport) => {
  return (
    (user.role === "ADMIN" && report.status === "UNVIEWED") ||
    (user.role === "MODERATOR" && report.status === "UNVIEWED") ||
    (user.role === "ADMIN" && report.status === "BAN_ESCALATED")
  );
};

/**
 * If ban is set by moderator, user can escalate to admin
 */
export const canEscalateBan = (user: PermUser, report: UserReport) => {
  return (
    !report.adminResolved &&
    !canModerateReports(user, report) &&
    report.status === ReportAction.BAN_ACTIVATED &&
    report.banEnd &&
    report.banEnd > new Date()
  );
};

/**
 * Whether a given report (and/or ban) can be cleared
 */
export const canClearReport = (user: PermUser, report: UserReport) => {
  return (
    // Moderators
    canModerateReports(user, report) ||
    // Users with finished bans
    (report.status === "BAN_ACTIVATED" &&
      report.banEnd &&
      report.banEnd <= new Date() &&
      report.reportedUserId === user.id)
  );
};

/**
 * Can change another user's avatar
 */
export const canChangeAvatar = (user: PermUser) => {
  return ["MODERATOR", "ADMIN"].includes(user.role);
};
