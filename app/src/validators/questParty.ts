import { z } from "zod";

export const questPartyCreateSchema = z.object({
  questId: z.string(),
  isPublic: z.boolean(),
});
export const questPartyIdSchema = z.object({ partyId: z.string() });
export const questPartyInviteSchema = questPartyIdSchema.extend({
  username: z.string().trim().min(1).max(191),
});
