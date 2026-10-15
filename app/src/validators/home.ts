import { z } from "zod";
import {
  HOME_FURNITURE_MAX_PLACEMENTS,
  HOME_FURNITURE_POSITION_MAX,
  HOME_FURNITURE_POSITION_MIN,
  HOME_FURNITURE_ROTATIONS,
  HOME_MAX_ROOMS,
  HOME_ROOM_IDS,
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
  room: z.enum(HOME_ROOM_IDS).optional(),
});
export type HomePlacement = z.infer<typeof homePlacementSchema>;

/** Inventory ownership, geometry, and essential actions are checked against the server snapshot. */
export const homeLayoutSchema = z
  .array(homePlacementSchema)
  .max(HOME_FURNITURE_MAX_PLACEMENTS * HOME_MAX_ROOMS)
  .refine(
    (placements) =>
      HOME_ROOM_IDS.every(
        (room) =>
          placements.filter((placement) => (placement.room ?? "main") === room)
            .length <= HOME_FURNITURE_MAX_PLACEMENTS,
      ),
    "Each room has reached its furniture display limit",
  )
  .refine(
    (placements) =>
      new Set(placements.map((placement) => placement.id)).size === placements.length,
    "Each furniture instance can only be placed once",
  );

export const homeFurnitureSaveInputSchema = z.strictObject({
  homeType: z.enum(HomeTypes),
  revision: z.int().nonnegative(),
  placements: homeLayoutSchema,
  styles: z
    .array(
      z.strictObject({
        room: z.enum(HOME_ROOM_IDS),
        paint: z.enum(["ivory", "sage", "indigo", "rose", "charcoal"]),
        floor: z.enum(["cedar", "oak", "slate", "terracotta"]),
      }),
    )
    .max(HOME_MAX_ROOMS)
    .optional(),
});
export type HomeRoomStyle = NonNullable<
  z.infer<typeof homeFurnitureSaveInputSchema>["styles"]
>[number];
export const homeVisitInputSchema = z.strictObject({
  userId: z.string().min(1).max(191),
});
export const homeSharingInputSchema = z.strictObject({
  revision: z.int().nonnegative(),
  isPublic: z.boolean(),
  inviteUsername: z.string().trim().min(1).max(191).optional(),
  revokeUserId: z.string().min(1).max(191).optional(),
});
export const homeUpgradeInputSchema = z.object({ homeType: z.enum(HomeTypes) });
export const homeStorageInputSchema = z.object({ userItemId: z.string() });
export const homeSleepResponseSchema = baseServerResponse.extend({
  newStatus: z.enum(["AWAKE", "ASLEEP"]).optional(),
});
