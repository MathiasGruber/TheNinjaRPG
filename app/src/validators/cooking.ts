import { z } from "zod";
import { MAX_COOKING_BATCHES } from "@/drizzle/constants";

/** Shared editor/validation restrictions keep meals out of equipment and combat actions. */
export const MEAL_ITEM_DEFAULTS = {
  destroyOnUse: true,
  preventBattleUsage: true,
  target: "SELF",
  method: "SINGLE",
  methodSize: null,
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

/** Meals require a stack snapshot and weighted caches a retry ID, enforced by their handlers. */
export const consumeItemInputSchema = z.object({
  userItemId: z.string(),
  expectedQuantity: z.int().positive().optional(),
  requestId: z
    .string()
    .regex(/^[\w-]{10,64}$/)
    .optional(),
});
