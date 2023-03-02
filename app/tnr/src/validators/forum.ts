import { z } from "zod";
//import { type User } from "@prisma/client";
import { type User } from "next-auth";

export const forumBoardSchema = z
  .object({
    board_id: z.string().cuid(),
    title: z.string().trim().min(10).max(88),
    content: z.string().min(10).max(5000),
  })
  .strict()
  .required();

export type ForumBoardSchema = z.infer<typeof forumBoardSchema>;

/**
 * Which user roles have access to moderate
 */
export const canModerate = (user: User) => {
  return user.role === "ADMIN" || user.role === "MODERATOR";
};
