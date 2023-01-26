import { z } from "zod";

export const mutateCommentSchema = z
  .object({
    comment: z.string().min(4).max(1000),
    object_id: z.string(),
  })
  .strict()
  .required();

export type MutateCommentSchema = z.infer<typeof mutateCommentSchema>;

export const deleteCommentSchema = z
  .object({
    id: z.string(),
  })
  .strict()
  .required();

export type DeleteCommentSchema = z.infer<typeof deleteCommentSchema>;

export const createConversationSchema = z
  .object({
    title: z.string().min(4).max(100),
    comment: z.string().min(4).max(1000),
    users: z.array(z.string()).min(1).max(5),
  })
  .strict()
  .required();

export type CreateConversationSchema = z.infer<typeof createConversationSchema>;
