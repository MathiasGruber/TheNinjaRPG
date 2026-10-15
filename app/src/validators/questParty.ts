import { z } from "zod";

/** Select an eligible team-enabled quest and whether uninvited players may join. */
export const questPartyCreateSchema = z.object({
  questId: z.string(),
  isPublic: z.boolean(),
});
/** Identify a team; the router verifies the caller's membership and command permissions. */
export const questPartyIdSchema = z.object({ partyId: z.string() });
/** Resolve a single invitation by username before applying the leader's roster CAS. */
export const questPartyInviteSchema = questPartyIdSchema.extend({
  username: z.string().trim().min(1).max(191),
});
/** Remove a teammate while retaining their personal progress and reward receipts. */
export const questPartyRemoveSchema = questPartyIdSchema.extend({
  userId: z.string().min(1),
});
