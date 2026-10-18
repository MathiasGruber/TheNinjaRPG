import { z } from "zod";
import { LOADOUT_NAME_MAX_LENGTH } from "@/drizzle/constants";

export const renameLoadoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(LOADOUT_NAME_MAX_LENGTH),
});
export type RenameLoadoutSchema = z.infer<typeof renameLoadoutSchema>;

// Fits the maximum entry count even when JSON escapes every ID character.
export const LOADOUT_SHARE_MAX_LENGTH = 128 * 1024;
export const LOADOUT_SHARE_MAX_ENTRIES = 100;
const sharedIdSchema = z.string().trim().min(1).max(191);

export const sharedJutsuLoadoutSchema = z
  .object({
    type: z.literal("tnr-jutsu-loadout"),
    version: z.literal(1),
    jutsuIds: z.array(sharedIdSchema).max(LOADOUT_SHARE_MAX_ENTRIES),
  })
  .strict()
  .transform((value) => ({ ...value, jutsuIds: [...new Set(value.jutsuIds)] }));

export const sharedJutsuLoadoutTextSchema = z
  .string()
  .min(1)
  .max(LOADOUT_SHARE_MAX_LENGTH)
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "Invalid loadout JSON" });
      return z.NEVER;
    }
  })
  .pipe(sharedJutsuLoadoutSchema);

export const previewJutsuLoadoutSchema = z.object({
  loadoutId: sharedIdSchema,
  text: z.string().min(1).max(LOADOUT_SHARE_MAX_LENGTH),
});

export const importJutsuLoadoutSchema = previewJutsuLoadoutSchema.extend({
  previewToken: z.string().regex(/^[a-f0-9]{64}$/),
});
