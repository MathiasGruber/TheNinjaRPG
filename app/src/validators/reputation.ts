import { z } from "zod";

export const awardReputationSchema = z.object({
  amount: z.coerce.number().min(0).max(100),
  reason: z.string().min(1, "Reason is required"),
});

export type AwardReputationSchema = z.infer<typeof awardReputationSchema>;
