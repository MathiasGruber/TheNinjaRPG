import { UserRoles } from "@/drizzle/constants";
import type { UserData, UserReport } from "@/drizzle/schema";
import type { UserRole } from "@/drizzle/constants";

export const canChangeContent = (role: UserRole) => {
  return [
    "CONTENT",
    "EVENT",
    "CODING-ADMIN",
    "MODERATOR-ADMIN",
    "CONTENT-ADMIN",
  ].includes(role);
};

export const canPlayHiddenQuests = (role: UserRole) => {
  return ["CONTENT", "EVENT", "CONTENT-ADMIN"].includes(role);
};

export const canSubmitNotification = (role: UserRole) => {
  return [
    "CONTENT",
    "EVENT",
    "HEAD_MODERATOR",
    "MODERATOR",
    "CODING-ADMIN",
    "MODERATOR-ADMIN",
    "CONTENT-ADMIN",
  ].includes(role);
};

export const canModifyEventGains = (role: UserRole) => {
  return ["CODING-ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canChangeDefaultAiProfile = (role: UserRole) => {
  return ["CODING-ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canChangeUserRole = (role: UserRole) => {
  if (role === "CODING-ADMIN") {
    return UserRoles;
  } else if (role === "CONTENT-ADMIN") {
    return ["USER", "CONTENT", "EVENT", "CONTENT-ADMIN"];
  } else if (role === "MODERATOR-ADMIN") {
    return ["USER", "HEAD_MODERATOR", "MODERATOR", "JR_MODERATOR"];
  }
};

export const canSwapVillage = (role: UserRole) => {
  return role !== "USER";
};

export const canUnstuckVillage = (role: UserRole) => {
  return role !== "USER";
};

export const canSwapBloodline = (role: UserRole) => {
  return ["CONTENT-ADMIN", "CONTENT", "EVENT", "CODING-ADMIN"].includes(role);
};

export const canSeeSecretData = (role: UserRole) => {
  return [
    "JR_MODERATOR",
    "MODERATOR",
    "HEAD_MODERATOR",
    "CODING-ADMIN",
    "MODERATOR-ADMIN",
  ].includes(role);
};

export const canSeeIps = (role: UserRole) => {
  return ["HEAD_MODERATOR", "CODING-ADMIN", "MODERATOR-ADMIN"].includes(role);
};

export const canModifyUserBadges = (role: UserRole) => {
  return ["CODING-ADMIN", "CONTENT-ADMIN", "EVENT", "CONTENT"].includes(role);
};

export const canDeleteUsers = (role: UserRole) => {
  return ["MODERATOR-ADMIN", "CODING-ADMIN", "HEAD_MODERATOR"].includes(role);
};

export const canModerateRoles: UserRole[] = [
  "JR_MODERATOR",
  "MODERATOR",
  "HEAD_MODERATOR",
  "MODERATOR-ADMIN",
  "CODING-ADMIN",
] as const;
export const canModerate = (role: UserRole) => {
  return canModerateRoles.includes(role);
};

export const canCreateNews = (role: UserRole) => {
  return role !== "USER";
};

export const canSeeReport = (user: UserData, report: UserReport) => {
  return (
    report.reporterUserId === user.userId ||
    report.reportedUserId === user.userId ||
    canModerateRoles.includes(user.role)
  );
};

export const canPostReportComment = (report: UserReport) => {
  return ["UNVIEWED", "BAN_ESCALATED"].includes(report.status);
};

export const canModerateReports = (user: UserData, report: UserReport) => {
  return (
    report.reportedUserId !== user.userId &&
    ((user.role === "MODERATOR-ADMIN" && report.status === "UNVIEWED") ||
      (user.role === "CODING-ADMIN" && report.status === "UNVIEWED") ||
      (user.role === "MODERATOR" && report.status === "UNVIEWED") ||
      (user.role === "HEAD_MODERATOR" && report.status === "UNVIEWED") ||
      (user.role === "JR_MODERATOR" && report.status === "UNVIEWED") ||
      (user.role === "MODERATOR-ADMIN" && report.status === "OFFICIAL_WARNING") ||
      (user.role === "MODERATOR-ADMIN" && report.status === "BAN_ACTIVATED") ||
      (user.role === "MODERATOR-ADMIN" && report.status === "BAN_ESCALATED") ||
      (user.role === "MODERATOR-ADMIN" && report.status === "SILENCE_ACTIVATED") ||
      (user.role === "MODERATOR-ADMIN" && report.status === "SILENCE_ESCALATED") ||
      (user.role === "CODING-ADMIN" && report.status === "OFFICIAL_WARNING") ||
      (user.role === "CODING-ADMIN" && report.status === "BAN_ACTIVATED") ||
      (user.role === "CODING-ADMIN" && report.status === "BAN_ESCALATED") ||
      (user.role === "CODING-ADMIN" && report.status === "SILENCE_ACTIVATED") ||
      (user.role === "CODING-ADMIN" && report.status === "SILENCE_ESCALATED") ||
      (user.role === "HEAD_MODERATOR" && report.status === "BAN_ACTIVATED") ||
      (user.role === "HEAD_MODERATOR" && report.status === "BAN_ESCALATED") ||
      (user.role === "HEAD_MODERATOR" && report.status === "SILENCE_ACTIVATED") ||
      (user.role === "HEAD_MODERATOR" && report.status === "SILENCE_ESCALATED") ||
      (user.role === "MODERATOR" && report.status === "OFFICIAL_WARNING") ||
      (user.role === "MODERATOR" && report.status === "SILENCE_ACTIVATED"))
  );
};

export const canBanUsers = (user: UserData) => {
  return ["MODERATOR-ADMIN", "HEAD_MODERATOR", "MODERATOR", "CODING-ADMIN"].includes(
    user.role,
  );
};

export const canSilenceUsers = (user: UserData) => {
  return [
    "MODERATOR-ADMIN",
    "HEAD_MODERATOR",
    "MODERATOR",
    "JR_MODERATOR",
    "CODING-ADMIN",
  ].includes(user.role);
};

export const canWarnUsers = (user: UserData) => {
  return [
    "MODERATOR-ADMIN",
    "HEAD_MODERATOR",
    "MODERATOR",
    "JR_MODERATOR",
    "CODING-ADMIN",
  ].includes(user.role);
};

export const canDeleteComment = (user: UserData, commentAuthorId: string) => {
  return (
    ["MODERATOR", "HEAD_MODERATOR", "CODING-ADMIN", "MODERATOR-ADMIN"].includes(
      user.role,
    ) || user.userId === commentAuthorId
  );
};

export const canEscalateBan = (user: UserData, report: UserReport) => {
  return (
    !report.adminResolved &&
    !canModerateReports(user, report) &&
    report.status === "BAN_ACTIVATED" &&
    report.banEnd &&
    report.banEnd > new Date()
  );
};

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

export const canClearUserNindo = (user: UserData) => {
  return ["MODERATOR", "HEAD_MODERATOR", "CODING-ADMIN", "MODERATOR-ADMIN"].includes(
    user.role,
  );
};

export const canEditPublicUser = (user: UserData) => {
  return ["CONTENT-ADMIN", "CODING-ADMIN", "MODERATOR-ADMIN"].includes(user.role);
};

export const canAwardReputation = (role: UserRole) => {
  return ["CODING-ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canChangeCombatBgScheme = (role: UserRole) => {
  return ["CODING-ADMIN", "CONTENT-ADMIN"].includes(role);
};

export const canReviewLinkPromotions = (role: UserRole) => {
  return ["CODING-ADMIN"].includes(role);
};
