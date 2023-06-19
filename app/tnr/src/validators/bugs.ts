import { z } from "zod";

export const systems = [
  "account",
  "alliancehall",
  "anbu",
  "avatar",
  "bank",
  "battlearena",
  "blackmarket",
  "bugs",
  "casino",
  "clanhall",
  "combat",
  "forum",
  "github",
  "home",
  "hospital",
  "inbox",
  "items",
  "itemshop",
  "jutsus",
  "login",
  "manual",
  "missionhall",
  "points",
  "profile",
  "policy",
  "reports",
  "register",
  "rules",
  "tavern",
  "terms",
  "traininggrounds",
  "travel",
  "welcome",
  "village",
  "unknown",
] as const;

export const bugreportSchema = z
  .object({
    title: z.string().trim().min(10).max(50),
    content: z.string().min(50).max(5000),
    system: z.enum(systems),
  })
  .strict()
  .required();

export type BugreportSchema = z.infer<typeof bugreportSchema>;
