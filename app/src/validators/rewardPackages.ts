import { z } from "zod";
import { hasReward, ObjectiveReward, rewardFields } from "@/validators/rewards";

/** Existing reward keys available to custom editor groups; nodes cannot invent payout fields. */
export const RewardField = z.enum(
  Object.keys(rewardFields) as [
    keyof typeof rewardFields,
    ...(keyof typeof rewardFields)[],
  ],
);
/** A named editor group with at least one distinct, supported reward field. */
export const RewardNodeValidator = z.object({
  name: z.string().trim().min(1).max(191),
  fields: z
    .array(RewardField)
    .min(1)
    .refine(
      (fields) => new Set(fields).size === fields.length,
      "Each field may appear once",
    ),
});
/** A nonempty reusable reward payload; mastery promotions require both stat and rank. */
export const RewardPackageValidator = z.object({
  name: z.string().trim().min(1).max(191),
  description: z.string().max(5000).prefault(""),
  rewards: ObjectiveReward.refine(hasReward, "Add at least one reward").refine(
    (reward) =>
      (!!reward.reward_mastery_stat && reward.reward_mastery_stat !== "None") ===
      (!!reward.reward_mastery_rank && reward.reward_mastery_rank !== "NONE"),
    "Select both the mastery and its rank reward",
  ),
});
/** An editable attachment whose copied payload survives catalog changes or deletion. */
export const RewardPackageSnapshot = RewardPackageValidator.extend({
  /** Unique attachment identity, regenerated when its objective is copied. */
  id: z.string().min(1).max(191),
  /** Source attribution and approval lookup; payouts read the copied rewards instead. */
  packageId: z.string().min(1).max(191),
});
/** Quest and objective rewards share direct fields plus optional catalog snapshots. */
export const questRewardFields = {
  ...rewardFields,
  reward_packages: z.array(RewardPackageSnapshot).max(50).optional(),
};
/** Normalize quest rewards while retaining their package snapshots. */
export const QuestReward = z.object(questRewardFields);
export type QuestRewardType = z.infer<typeof QuestReward>;
export type RewardPackageSnapshotType = z.infer<typeof RewardPackageSnapshot>;
/** Catalog package create/update input; an absent id creates a new source. */
export const SaveRewardPackage = z.object({
  id: z.string().optional(),
  data: RewardPackageValidator,
});
/** Catalog node create/update input; an absent id creates a new grouping. */
export const SaveRewardNode = z.object({
  id: z.string().optional(),
  data: RewardNodeValidator,
});
