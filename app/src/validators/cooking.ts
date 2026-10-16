import { z } from "zod";
import { MAX_COOKING_BATCHES } from "@/drizzle/constants";
import type { ZodAllTags } from "@/validators/combat";

/** Shared editor/validation restrictions keep meals out of equipment and combat actions. */
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

/** Shared production input counts batches; meal output quantity comes from the recipe. */
export const cookItemInputSchema = z.object({
  itemId: z.string(),
  quantity: z.int().min(1).max(MAX_COOKING_BATCHES).prefault(1),
});

/** Meals require a stack snapshot; other consumables retain their optional-quantity contract. */
export const consumeItemInputSchema = z.object({
  userItemId: z.string(),
  expectedQuantity: z.int().positive().optional(),
});

/** A fixed positive stat or regeneration bonus whose duration is controlled by the meal. */
export const isMealEffect = (effect: ZodAllTags) =>
  (effect.type === "increasestat" || effect.type === "increaseregeneration") &&
  effect.power > 0 &&
  effect.powerPerLevel === 0 &&
  effect.rounds === undefined &&
  !effect.coordinateTargeting &&
  (effect.type === "increaseregeneration" ||
    (!effect.elements?.length &&
      (!!effect.statTypes?.length || !!effect.generalTypes?.length)));
