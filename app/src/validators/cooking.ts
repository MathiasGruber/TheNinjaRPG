import { z } from "zod";
import { MAX_COOKING_BATCHES } from "@/drizzle/constants";
import type { ZodAllTags } from "@/validators/combat";

export const MEAL_ITEM_DEFAULTS = {
  destroyOnUse: true,
  preventBattleUsage: true,
  target: "SELF",
  method: "SINGLE",
  slot: "ITEM",
  weaponType: "NONE",
  canBeImbued: false,
  maxEquips: 0,
  isFarmSeed: false,
  isFarmFertilizer: false,
  parentItemId: null,
  requiredSkillId: null,
  bloodlineId: null,
} as const;

export const cookItemInputSchema = z.object({
  itemId: z.string(),
  quantity: z.int().min(1).max(MAX_COOKING_BATCHES).prefault(1),
});

export const consumeItemInputSchema = z.object({
  userItemId: z.string(),
  expectedQuantity: z.int().positive().optional(),
});

export const isMealEffect = (effect: ZodAllTags) =>
  (effect.type === "increasestat" || effect.type === "increaseregeneration") &&
  effect.power > 0 &&
  effect.powerPerLevel === 0 &&
  effect.rounds === undefined &&
  !effect.coordinateTargeting &&
  (effect.type === "increaseregeneration" ||
    (!effect.elements?.length &&
      (!!effect.statTypes?.length || !!effect.generalTypes?.length)));
