import { z } from "zod";
import {
  HOME_FURNITURE_MAX_WIDTH,
  HOME_FURNITURE_MIN_WIDTH,
  HomeFurnitureActions,
} from "@/drizzle/constants";
import type { Item } from "@/drizzle/schema";

export const furnitureItemSchema = z.object({
  furnitureAction: z
    .union([z.enum(HomeFurnitureActions), z.literal("")])
    .nullish()
    .transform((value) => value || null),
  furnitureWidth: z.coerce
    .number()
    .min(HOME_FURNITURE_MIN_WIDTH)
    .max(HOME_FURNITURE_MAX_WIDTH)
    .prefault(24),
  furnitureGroundAnchor: z.coerce.number().min(1).max(100).prefault(100),
  furnitureIsFloor: z.coerce.boolean().prefault(false),
});

/** Furniture is scene content; these defaults also normalize item-type changes in the editor. */
export const FURNITURE_ITEM_DEFAULTS = {
  slot: "NONE",
  target: "SELF",
  method: "SINGLE",
  weaponType: "NONE",
  coordinateTargeting: null,
  effects: [],
  battleDescription: "",
  maxEquips: 0,
  preventBattleUsage: true,
  destroyOnUse: false,
  canStack: false,
  stackSize: 1,
  maxImbueNumber: 0,
  maxDurability: 0,
  canBeImbued: false,
  range: 0,
  cooldown: 0,
  chakraCost: 0,
  staminaCost: 0,
  healthCost: 0,
  chakraCostReducePerLvl: 0,
  staminaCostReducePerLvl: 0,
  healthCostReducePerLvl: 0,
  actionCostPerc: 100,
  parentItemId: null,
  bloodlineId: null,
  requiredSkillId: null,
  crystalTargetTypes: null,
  isFarmSeed: false,
  isFarmFertilizer: false,
  farmSellValue: 0,
} satisfies Partial<Item>;
