import { z } from "zod";
import {
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_FURNITURE_POSITION_MAX,
  HOME_FURNITURE_POSITION_MIN,
  HOME_FURNITURE_ROTATIONS,
  HomeTypes,
} from "@/drizzle/constants";
import { baseServerResponse } from "@/validators/base";

/** Placement belongs to one UserItem row, so multiple copies of the same content item remain independent. */
export const homePlacementSchema = z.strictObject({
  id: z.string().min(1).max(191),
  x: z.number().min(HOME_FURNITURE_POSITION_MIN).max(HOME_FURNITURE_POSITION_MAX),
  y: z.number().min(HOME_FURNITURE_POSITION_MIN).max(HOME_FURNITURE_POSITION_MAX),
  /** Clockwise quarter turns select content-authored views, rather than transforming a sprite. */
  rotation: z.union(HOME_FURNITURE_ROTATIONS.map((rotation) => z.literal(rotation))),
});
export type HomePlacement = z.infer<typeof homePlacementSchema>;

/** An empty room is valid; inventory ownership is checked against the server snapshot. */
export const homeLayoutSchema = z
  .array(homePlacementSchema)
  .max(HOME_FURNITURE_MAX_PLACEMENTS)
  .refine(
    (placements) =>
      new Set(placements.map((placement) => placement.id)).size === placements.length,
    "Each furniture instance can only be placed once",
  );

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
