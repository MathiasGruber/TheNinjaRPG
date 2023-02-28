import { z } from "zod";

export const mutateCommentSchema = z
  .object({
    comment: z.string().min(20).max(1000),
    object_id: z.string().cuid(),
  })
  .strict()
  .required();

export type MutateCommentSchema = z.infer<typeof mutateCommentSchema>;

export const deleteCommentSchema = z
  .object({
    id: z.string().cuid(),
  })
  .strict()
  .required();

export type DeleteCommentSchema = z.infer<typeof deleteCommentSchema>;
