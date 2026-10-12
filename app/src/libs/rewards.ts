import { UserRanks } from "@/drizzle/constants";
import {
  MASTERY_EXPERIENCE_FIELDS,
  type ObjectiveRewardType,
} from "@/validators/rewards";
/**
 * Collapse multiple rewards into a single reward
 * @param rewards - Rewards to collapse
 * @returns Collapsed reward
 */
export const collapseRewards = (
  rewards: ObjectiveRewardType[],
): ObjectiveRewardType => {
  const collapsed: ObjectiveRewardType = {
    reward_money: 0,
    reward_seichi_silver: 0,
    reward_clanpoints: 0,
    reward_anbupoints: 0,
    reward_exp: 0,
    reward_tokens: 0,
    reward_prestige: 0,
    reward_reputation: 0,
    reward_skillpoints: 0,
    reward_medical_experience: 0,
    reward_hunting_experience: 0,
    reward_crafting_experience: 0,
    reward_gathering_experience: 0,
    reward_sage_mastery_experience: 0,
    reward_items: [],
    reward_jutsus: [],
    reward_bloodlines: [],
    reward_sage_modes: [],
    reward_badges: [],
    reward_rank: "NONE",
    reward_village_membership: "NONE",
    reward_hunter_items: false,
    reward_gathering_items: false,
    reward_hunter_items_ids: [],
    reward_gathering_items_ids: [],
    reward_war_damage: 0,
    reward_war_healing: 0,
  };

  rewards.forEach((reward) => {
    // Sum numeric rewards
    if (reward.reward_money) {
      collapsed.reward_money += reward.reward_money;
    }
    if (reward.reward_seichi_silver) {
      collapsed.reward_seichi_silver += reward.reward_seichi_silver;
    }
    if (reward.reward_clanpoints) {
      collapsed.reward_clanpoints += reward.reward_clanpoints;
    }
    if (reward.reward_anbupoints) {
      collapsed.reward_anbupoints += reward.reward_anbupoints;
    }
    if (reward.reward_exp) {
      collapsed.reward_exp += reward.reward_exp;
    }
    if (reward.reward_tokens) {
      collapsed.reward_tokens += reward.reward_tokens;
    }
    if (reward.reward_prestige) {
      collapsed.reward_prestige += reward.reward_prestige;
    }
    if (reward.reward_reputation) {
      collapsed.reward_reputation += reward.reward_reputation;
    }
    if (reward.reward_skillpoints) {
      collapsed.reward_skillpoints += reward.reward_skillpoints;
    }
    if (reward.reward_medical_experience) {
      collapsed.reward_medical_experience += reward.reward_medical_experience;
    }
    if (reward.reward_hunting_experience) {
      collapsed.reward_hunting_experience += reward.reward_hunting_experience;
    }
    if (reward.reward_crafting_experience) {
      collapsed.reward_crafting_experience += reward.reward_crafting_experience;
    }
    if (reward.reward_gathering_experience) {
      collapsed.reward_gathering_experience += reward.reward_gathering_experience;
    }
    for (const field of MASTERY_EXPERIENCE_FIELDS)
      if (reward[field])
        collapsed[field] = (collapsed[field] ?? 0) + (reward[field] ?? 0);
    if (
      reward.reward_mastery_stat &&
      reward.reward_mastery_stat !== "None" &&
      reward.reward_mastery_rank
    ) {
      collapsed.reward_mastery_stat = reward.reward_mastery_stat;
      collapsed.reward_mastery_rank = reward.reward_mastery_rank;
    }
    if (reward.reward_sage_mastery_experience) {
      collapsed.reward_sage_mastery_experience += reward.reward_sage_mastery_experience;
    }
    if (reward.reward_war_damage) {
      collapsed.reward_war_damage += reward.reward_war_damage;
    }
    if (reward.reward_war_healing) {
      collapsed.reward_war_healing += reward.reward_war_healing;
    }

    // Only set reward hunter items to true if any of the rewards have it
    if (reward.reward_hunter_items) {
      collapsed.reward_hunter_items = true;
    }

    // Only set reward gathering items to true if any of the rewards have it
    if (reward.reward_gathering_items) {
      collapsed.reward_gathering_items = true;
    }

    // Concatenate valid ids
    if (reward.reward_hunter_items_ids) {
      collapsed.reward_hunter_items_ids.push(...reward.reward_hunter_items_ids);
    }
    if (reward.reward_gathering_items_ids) {
      collapsed.reward_gathering_items_ids.push(...reward.reward_gathering_items_ids);
    }

    // Concatenate array rewards (nullish-guarded: legacy JSON rows from callers that
    // skip Zod normalization may predate a field, leaving it undefined)
    collapsed.reward_items.push(...(reward.reward_items ?? []));
    collapsed.reward_jutsus.push(...(reward.reward_jutsus ?? []));
    collapsed.reward_bloodlines.push(...(reward.reward_bloodlines ?? []));
    collapsed.reward_sage_modes.push(...(reward.reward_sage_modes ?? []));
    collapsed.reward_badges.push(...(reward.reward_badges ?? []));

    // Handle rank reward (take the highest rank)
    if (reward.reward_rank !== "NONE") {
      if (collapsed.reward_rank === "NONE") {
        collapsed.reward_rank = reward.reward_rank;
      } else {
        // Compare ranks and keep the higher one
        const rankOrder = UserRanks;
        const currentIndex = rankOrder.indexOf(collapsed.reward_rank);
        const newIndex = rankOrder.indexOf(reward.reward_rank);
        if (newIndex > currentIndex) {
          collapsed.reward_rank = reward.reward_rank;
        }
      }
    }

    // Handle village membership reward
    if (reward.reward_village_membership !== "NONE") {
      collapsed.reward_village_membership = reward.reward_village_membership;
    }
  });

  return collapsed;
};
