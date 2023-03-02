import { z } from "zod";

export const systems = [
  "avatar",
  "bugs",
  "profile",
  "reports",
  "register",
  "login",
  "tavern",
  "travel",
  "forum",
  "terms",
  "policy",
  "rules",
  "github",
  "welcome",
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
    content: z.string().min(50).max(5000),
    system: z.enum(systems),
  })
  .strict()
  .required();

export type BugreportSchema = z.infer<typeof bugreportSchema>;
