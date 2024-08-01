import { z } from "zod";
import { GAME_SETTING_GAINS_MULTIPLIER } from "@/drizzle/constants";

export const changeSettingSchema = z.object({
  setting: z.enum(["trainingGainMultiplier", "regenGainMultiplier"]),
  multiplier: z.enum(GAME_SETTING_GAINS_MULTIPLIER),
  days: z.number().min(0).max(31),
});
export type ChangeSettingSchema = z.infer<typeof changeSettingSchema>;
