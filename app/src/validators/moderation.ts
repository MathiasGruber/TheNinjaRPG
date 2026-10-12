import { z } from "zod";

export const moderationDecisionSchema = z.object({
  createReport: z.enum([
    "REPORT_CLEARED",
    "OFFICIAL_WARNING",
    "SILENCE_ACTIVATED",
    "BAN_ACTIVATED",
  ]),
  reasoning: z.string(),
});

export const nsfwClassificationSchema = z.object({
  isNsfw: z.boolean(),
  reason: z.string(),
});

export const updateReasonValidationSchema = z.object({
  allowUpdate: z.boolean(),
  comment: z.string(),
});
