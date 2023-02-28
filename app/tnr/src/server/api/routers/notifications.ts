import { ReportAction } from "@prisma/client";
import { type NavBarDropdownLink } from "../../../libs/menus";

import { createTRPCRouter, protectedProcedure } from "../trpc";

export const notificationsRouter = createTRPCRouter({
  getAll: protectedProcedure.query(async ({ ctx }) => {
    // List of notifications to populate
    const notifications: NavBarDropdownLink[] = [];
    // Get number of un-resolved user reports
    if (
      ctx.session.user.role === "MODERATOR" ||
      ctx.session.user.role === "ADMIN"
    ) {
      const userReports = await ctx.prisma.userReport.count({
        where: {
          status: {
            in: [ReportAction.UNVIEWED, ReportAction.BAN_ESCALATED],
          },
        },
      });
      if (userReports > 0) {
        notifications.push({
          href: "/reports",
          name: `${userReports} active reports!`,
          color: "blue",
        });
      }
    }
    // Check if user is banned
    if (ctx.session.user.isBanned) {
      notifications.push({
        href: "/reports",
        name: "You are banned!",
        color: "red",
      });
    }
    return notifications;
  }),
});
