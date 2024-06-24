import type { ReportAction } from "../../drizzle/schema";

export const reportCommentColor = (status: ReportAction | null) => {
  switch (status) {
    case "UNVIEWED":
      return "default";
    case "REPORT_CLEARED":
      return "green";
    case "BAN_ACTIVATED":
      return "red";
    case "BAN_ESCALATED":
      return "blue";
    default:
      return "default";
  }
};

export const reportCommentExplain = (status: ReportAction | null) => {
  switch (status) {
    case "REPORT_CLEARED":
      return "Infraction Cleared";
    case "BAN_ACTIVATED":
      return "User Banned";
    case "BAN_ESCALATED":
      return "Ban Escalated to Admin";
    case "SILENCE_ACTIVATED":
      return "User Silenced";
    case "SILENCE_ESCALATED":
      return "Silence Escalated to Admin";
    default:
      return "";
  }
};
