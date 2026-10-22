import {
  DUNGEON_MAX_GRANTED_ITEMS,
  DUNGEON_MAX_REWARD_AMOUNT,
} from "@/drizzle/constants";
import { postProcessRewards } from "@/libs/quest";
import { collapseRewards } from "@/libs/rewards";
import type { DungeonContent } from "@/validators/dungeon";
import { ObjectiveReward, REWARD_CHOICE_AMOUNT_FIELDS } from "@/validators/rewards";

/** Roll each authored bundle once; package item odds retain the shared reward semantics. */
export const rollDungeonRewards = (rewards: DungeonContent["rewards"]) => {
  const drops = rewards.drops.filter((drop) => Math.random() * 100 < drop.chance);
  return postProcessRewards(
    collapseRewards([
      ObjectiveReward.parse({
        reward_money: rewards.money,
        reward_exp: rewards.experience,
        reward_tokens: rewards.tokens,
        reward_prestige: rewards.prestige,
      }),
      ...drops.flatMap((drop) => {
        const quantity = drop.quantity ?? 1;
        if (drop.type === "package") {
          const snapshot = drop.package;
          if (!snapshot) throw new Error("Dungeon reward package snapshot is missing");
          return Array.from({ length: quantity }, () => snapshot.rewards);
        }
        return [
          ObjectiveReward.parse(
            drop.type === "jutsu"
              ? { reward_jutsus: [drop.id] }
              : { reward_items: [{ ids: [drop.id], number: 100, quantity }] },
          ),
        ];
      }),
    ]),
  );
};

/** Bound item expansion before any rolls or grants, including every possible package drop. */
export const dungeonRewardError = (
  rewards: DungeonContent["rewards"],
): string | null => {
  let total = 0;
  const amounts = ObjectiveReward.parse({
    reward_money: rewards.money,
    reward_exp: rewards.experience,
    reward_tokens: rewards.tokens,
    reward_prestige: rewards.prestige,
  });
  for (const drop of rewards.drops) {
    const quantity = drop.quantity ?? 1;
    if (drop.type === "package") {
      if (!drop.package)
        return "A dungeon reward package is missing. Save the dungeon again.";
      for (const field of REWARD_CHOICE_AMOUNT_FIELDS) {
        amounts[field] =
          (amounts[field] ?? 0) + Math.abs(drop.package.rewards[field] ?? 0) * quantity;
        if (
          !Number.isFinite(amounts[field]) ||
          amounts[field] > DUNGEON_MAX_REWARD_AMOUNT
        )
          return `Dungeon rewards can grant at most ${DUNGEON_MAX_REWARD_AMOUNT.toLocaleString("en-US")} per scalar reward, including package contents.`;
      }
      total +=
        quantity *
        drop.package.rewards.reward_items.reduce(
          (sum, entry) =>
            sum + entry.ids.length * Math.max(1, Math.floor(entry.quantity ?? 1)),
          0,
        );
    } else if (drop.type !== "jutsu") total += quantity;
    if (!Number.isFinite(total) || total > DUNGEON_MAX_GRANTED_ITEMS)
      return `Dungeon rewards can grant at most ${DUNGEON_MAX_GRANTED_ITEMS} items per player, including package contents.`;
  }
  return null;
};
