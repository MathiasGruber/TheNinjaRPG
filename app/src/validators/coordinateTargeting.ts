import { z } from "zod";

export const CoordinateOrigins = ["BATTLEFIELD", "CASTER", "TARGET"] as const;
export const CoordinateSelections = ["ALL", "EXCLUDE", "RANDOM"] as const;

/** Battlefield positions are zero-based; relative positions are column/row offsets. */
export const coordinateTargetingSchema = z
  .object({
    origin: z.enum(CoordinateOrigins).prefault("BATTLEFIELD"),
    selection: z.enum(CoordinateSelections).prefault("ALL"),
    coordinates: z
      .array(
        z.object({
          longitude: z.number().int().min(-100).max(100),
          latitude: z.number().int().min(-100).max(100),
        }),
      )
      .max(400)
      .prefault([]),
    randomCount: z.number().int().min(1).max(400).prefault(1),
  })
  .superRefine((data, ctx) => {
    if (data.selection === "ALL" && data.coordinates.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["coordinates"],
        message: "Choose at least one coordinate.",
      });
    }
    const seen = new Set<string>();
    data.coordinates.forEach((coordinate, index) => {
      const key = `${coordinate.longitude},${coordinate.latitude}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["coordinates", index],
          message: "Coordinates must be unique.",
        });
      }
      seen.add(key);
      if (
        data.origin === "BATTLEFIELD" &&
        (coordinate.longitude < 0 || coordinate.latitude < 0)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["coordinates", index],
          message: "Battlefield coordinates cannot be negative.",
        });
      }
    });
  });

export type CoordinateTargeting = z.output<typeof coordinateTargetingSchema>;
