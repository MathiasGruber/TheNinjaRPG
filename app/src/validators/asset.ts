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
});

export type ZodGameAssetType = z.infer<typeof gameAssetValidator>;
