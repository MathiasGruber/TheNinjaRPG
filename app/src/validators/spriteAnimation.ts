import { z } from "zod";
import { AvatarFacings } from "@/drizzle/constants";

/** Row-major sheets contain equally sized cells, with no gutters or padding. */
export const spriteAnimationSchema = z
  .object({
    name: z.string().trim().min(1).max(191),
    url: z
      .url()
      .max(2048)
      .refine((url) => /^https?:\/\//.test(url), "Use an HTTP image URL"),
    columns: z.coerce.number().int().min(1).max(32),
    rows: z.coerce.number().int().min(1).max(32),
    frameCount: z.coerce.number().int().min(2).max(256),
    fps: z.coerce.number().min(1).max(60),
    facing: z.enum(AvatarFacings),
  })
  .refine((value) => value.frameCount <= value.columns * value.rows, {
    message: "Frame count exceeds the sheet grid",
    path: ["frameCount"],
  });

/** Select an AI; the router also checks that it exists and that the caller can edit content. */
export const aiSpriteAnimationInput = z.object({ userId: z.string().min(1) });
/** Null removes an override; the router verifies both the action and library entry exist. */
export const assignSpriteAnimationSchema = aiSpriteAnimationInput.extend({
  actionKey: z.string().min(1).max(191),
  animationId: z.string().min(1).nullable(),
});

/** Form values may contain numeric strings; the shared schema coerces them before saving. */
export type SpriteAnimationInput = z.input<typeof spriteAnimationSchema>;
