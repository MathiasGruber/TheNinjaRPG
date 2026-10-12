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
