import { z } from "zod";
import { GameAssetTypes } from "@/drizzle/constants";

export const gameAssetValidator = z.object({
  name: z.string().min(1).max(191),
  image: z.string().url(),
  frames: z.coerce.number().int().min(1).max(100),
  speed: z.coerce.number().int().min(1).max(100),
  type: z.enum(GameAssetTypes),
  licenseDetails: z.string().min(1).max(512),
  onInitialBattleField: z.boolean(),
  hidden: z.coerce.boolean().optional(),
  folder: z
    .string()
    .regex(/^[a-zA-Z0-9]*$/, "Folder name can only contain letters and numbers")
    .optional(),
});

export type ZodGameAssetType = z.infer<typeof gameAssetValidator>;

export const gameAssetSchema = z.object({
  name: z.string().optional(),
  type: z.enum(GameAssetTypes),
  tags: z.array(z.string()).optional(),
  folder: z.string().optional(),
});

export type GameAssetSchema = z.infer<typeof gameAssetSchema>;
