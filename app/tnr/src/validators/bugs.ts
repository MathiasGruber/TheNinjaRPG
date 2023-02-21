import { z } from "zod";

export const systems = [
  "avatar",
  "profile",
  "register",
  "login",
  "tavern",
  "terms",
  "policy",
  "rules",
  "unknown",
] as const;

export const bugreportSchema = z
  .object({
    title: z
      .string()
      .trim()
      .regex(new RegExp("^[a-zA-Z0-9_\\s]+$"), {
        message: "Must only contain alphanumeric characters",
      })
      .min(10)
      .max(50),
    description: z.string(),
    system: z.enum(systems),
  })
  .strict()
  .required();

export type BugreportSchema = z.infer<typeof bugreportSchema>;

export const mutateCommentSchema = z
  .object({
    comment: z.string().min(10).max(1000),
    object_id: z.string().cuid(),
  })
  .strict()
  .required();

export type MutateCommentSchema = z.infer<typeof mutateCommentSchema>;
