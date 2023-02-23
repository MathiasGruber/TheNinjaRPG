import { z } from "zod";

export const systems = [
  "bug_report",
  "bug_comment",
  "forum_port",
  "tavern_post",
] as const;

export const userReportSchema = z.object({
  system: z.enum(systems),
  system_id: z.string().cuid(),
  reported_userId: z.string().cuid(),
  reason: z.string().min(1).max(1000),
});

export type UserReportSchema = z.infer<typeof userReportSchema>;
