import { z } from "zod";
import {
  HOME_FURNITURE_POSITION_MAX,
  HOME_FURNITURE_POSITION_MIN,
  HomeFurnitureCoreIds,
  HomeFurnitureIds,
  HomeFurniturePurchaseIds,
  HomeTypes,
} from "@/drizzle/constants";
import { baseServerResponse } from "@/validators/base";

/** Each catalogue item has one movable instance; rotation mirrors its facing. */
export const homePlacementSchema = z.strictObject({
  id: z.enum(HomeFurnitureIds),
  x: z.number().min(HOME_FURNITURE_POSITION_MIN).max(HOME_FURNITURE_POSITION_MAX),
  y: z.number().min(HOME_FURNITURE_POSITION_MIN).max(HOME_FURNITURE_POSITION_MAX),
  rotation: z.union([z.literal(0), z.literal(1)]),
});
export type HomePlacement = z.infer<typeof homePlacementSchema>;

/** Core actions cannot disappear, while purchased decorations may remain in storage. */
export const homeLayoutSchema = z
  .array(homePlacementSchema)
  .min(HomeFurnitureCoreIds.length)
  .max(HomeFurnitureIds.length)
  .refine(
    (placements) =>
      new Set(placements.map((placement) => placement.id)).size === placements.length,
    "Each furniture item can only be placed once",
  )
  .refine(
    (placements) =>
      HomeFurnitureCoreIds.every((id) =>
        placements.some((placement) => placement.id === id),
      ),
    "Your home needs a bed, armory, kitchen and garden",
  );

/** Ownership is server-managed; separate tier layouts survive home upgrades and downgrades. */
export const homeFurnitureStateSchema = z.strictObject({
  owned: z.array(z.enum(HomeFurniturePurchaseIds)),
  layouts: z.partialRecord(z.enum(HomeTypes), homeLayoutSchema),
});
export type HomeFurnitureState = z.infer<typeof homeFurnitureStateSchema>;

export const homeFurniturePurchaseInputSchema = z.strictObject({
  furnitureId: z.enum(HomeFurniturePurchaseIds),
  revision: z.int().nonnegative(),
});
export const homeFurnitureSaveInputSchema = z.strictObject({
  homeType: z.enum(HomeTypes),
  revision: z.int().nonnegative(),
  placements: homeLayoutSchema,
});
export const homeUpgradeInputSchema = z.object({ homeType: z.enum(HomeTypes) });
export const homeStorageInputSchema = z.object({ userItemId: z.string() });
export const homeSleepResponseSchema = baseServerResponse.extend({
  newStatus: z.enum(["AWAKE", "ASLEEP"]).optional(),
});
