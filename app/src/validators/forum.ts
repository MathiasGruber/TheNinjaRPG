import { z } from "zod";
import type { UserData } from "../../drizzle/schema";

export const forumBoardSchema = z
  .object({
    board_id: z.string(),
    title: z.string().trim().min(10).max(88),
    content: z.string().min(10).max(10000),
  })
  .strict()
  .required();

export type ForumBoardSchema = z.infer<typeof forumBoardSchema>;

/**
 * Which user roles have access to moderate
 */
export const canModerate = (user: UserData) => {
  return ["MODERATOR", "HEAD_MODERATOR", "ADMIN"].includes(user.role);
};

/**
 * Which user roles can create news
 */
export const canCreateNews = (user: UserData) => {
  return user.role !== "USER";
};
