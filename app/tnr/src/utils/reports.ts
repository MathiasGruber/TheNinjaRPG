import { type ReportAction } from "@prisma/client";

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
      return "Escalated to Admin";

    default:
      return "";
  }
};
