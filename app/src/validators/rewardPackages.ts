import { z } from "zod";
import { hasReward, ObjectiveReward, rewardFields } from "@/validators/rewards";

export const RewardField = z.enum(
  Object.keys(rewardFields) as [
    keyof typeof rewardFields,
    ...(keyof typeof rewardFields)[],
  ],
);
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
export const RewardPackageSnapshot = RewardPackageValidator.extend({
  id: z.string().min(1).max(191),
  packageId: z.string().min(1).max(191),
});
export const questRewardFields = {
  ...rewardFields,
  reward_packages: z.array(RewardPackageSnapshot).max(50).optional(),
};
export const QuestReward = z.object(questRewardFields);
export type QuestRewardType = z.infer<typeof QuestReward>;
export type RewardPackageSnapshotType = z.infer<typeof RewardPackageSnapshot>;
export const SaveRewardPackage = z.object({
  id: z.string().optional(),
  data: RewardPackageValidator,
});
export const SaveRewardNode = z.object({
  id: z.string().optional(),
  data: RewardNodeValidator,
});
