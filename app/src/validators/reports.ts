import { z } from "zod";
import type { UserData, UserReport } from "../../drizzle/schema";

export const systems = [
  "forum_comment",
  "tavern_comment",
  "conversation_comment",
  "user_profile",
  "concept_art",
] as const;

export const userReportSchema = z.object({
  system: z.enum(systems),
  system_id: z.string(),
  reported_userId: z.string(),
  reason: z.string().min(1).max(1000),
});

export type UserReportSchema = z.infer<typeof userReportSchema>;

export const reportCommentSchema = z.object({
  comment: z.string().min(10).max(5000),
  object_id: z.string(),
  banTime: z.number().min(0).max(365),
});

export type ReportCommentSchema = z.infer<typeof reportCommentSchema>;

/**
 * Whether a user can see a given report based on his role & userId
 */
export const canSeeReport = (user: UserData, report: UserReport) => {
  return (
    report.reporterUserId === user.userId ||
    report.reportedUserId === user.userId ||
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
export const canModerateReports = (user: UserData, report: UserReport) => {
  return (
    report.reportedUserId !== user.userId &&
    report.reporterUserId !== user.userId &&
    ((user.role === "ADMIN" && report.status === "UNVIEWED") ||
      (user.role === "MODERATOR" && report.status === "UNVIEWED") ||
      (user.role === "ADMIN" && report.status === "BAN_ACTIVATED") ||
      (user.role === "ADMIN" && report.status === "BAN_ESCALATED") ||
      (user.role === "ADMIN" && report.status === "SILENCE_ACTIVATED") ||
      (user.role === "ADMIN" && report.status === "SILENCE_ESCALATED"))
  );
};

/**
 * Whether a given user can delete a comment
 */
export const canDeleteComment = (user: UserData, commentAuthorId: string) => {
  return (
    user.role === "ADMIN" ||
    user.role === "MODERATOR" ||
    user.userId === commentAuthorId
  );
};

/**
 * If ban is set by moderator, user can escalate to admin
 */
export const canEscalateBan = (user: UserData, report: UserReport) => {
  return (
    !report.adminResolved &&
    !canModerateReports(user, report) &&
    report.status === "BAN_ACTIVATED" &&
    report.banEnd &&
    report.banEnd > new Date()
  );
};

/**
 * Whether a given report (and/or ban) can be cleared
 */
export const canClearReport = (user: UserData, report: UserReport) => {
  return (
    // Moderators
    canModerateReports(user, report) ||
    // Users with finished bans
    (report.status === "BAN_ACTIVATED" &&
      report.banEnd &&
      report.banEnd <= new Date() &&
      report.reportedUserId === user.userId)
  );
};

/**
 * Can change another user's avatar
 */
export const canChangePublicUser = (user: UserData) => {
  return ["MODERATOR", "ADMIN"].includes(user.role);
};
