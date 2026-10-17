import { z } from "zod";
import { MasteryTypes, TITLE_MAX_EFFECTS } from "@/drizzle/constants";

/** Titles grant permanent, additive flat bonuses without combat targeting or level scaling. */
export const TitleEffectSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("increasemastery"),
      power: z.number().finite().nonnegative(),
      masteryTypes: z.array(z.enum(MasteryTypes)).min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("increaseregeneration"),
      power: z.number().finite().nonnegative(),
    })
    .strict(),
]);
export type TitleEffect = z.infer<typeof TitleEffectSchema>;
/** Author catalog entries; later edits do not replace players' acquired effect snapshots. */
export const TitleValidator = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().max(512),
  effects: z.array(TitleEffectSchema).max(TITLE_MAX_EFFECTS),
  archived: z.boolean(),
});
export type TitleData = z.infer<typeof TitleValidator>;
/** Identify the staff catalog row and validate its complete editable payload. */
export const UpdateTitleSchema = z.object({
  id: z.string().min(1),
  data: TitleValidator,
});
/** Null clears the displayed label; the mutation verifies ownership for every selected ID. */
export const SelectTitleSchema = z.object({ titleId: z.string().min(1).nullable() });
