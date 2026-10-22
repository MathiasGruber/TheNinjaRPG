import { afterEach, expect, it, vi } from "bun:test";
import { dungeonRewardError, rollDungeonRewards } from "@/libs/dungeonRewards";
import { ObjectiveReward } from "@/validators/rewards";
import { dungeonContent } from "../setup/dungeon";

afterEach(() => vi.restoreAllMocks());

it("rolls once for the whole drop quantity and preserves package item chances", () => {
  const rewards = dungeonContent().rewards;
  rewards.drops = [
    {type: "item", id: "hit", chance: 50, quantity: 4},
    {type: "item", id: "miss", chance: 50, quantity: 4},
    {type: "package", id: "pack", chance: 100, quantity: 2, package: {name: "Bundle", description: "", rewards: ObjectiveReward.parse({reward_money: 7, reward_items: [{ids: ["nested"], number: 50, quantity: 3}]})}},
  ];
  vi.spyOn(Math, "random").mockReturnValueOnce(0.49).mockReturnValueOnce(0.5).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0.49).mockReturnValue(0.5);
  const rolled = rollDungeonRewards(rewards);
  expect(rolled.reward_money).toBe(114);
  expect(rolled.reward_items).toEqual(["hit", "hit", "hit", "hit", "nested", "nested", "nested"]);
});

it("bounds worst-case package quantities before expanding nested item rewards", () => {
  const rewards = dungeonContent().rewards;
  rewards.drops = [{type: "package", id: "pack", chance: 1, quantity: 100, package: {name: "Bundle", description: "", rewards: ObjectiveReward.parse({reward_items: [{ids: ["item"], number: 1, quantity: 20}]})}}];
  expect(dungeonRewardError(rewards)).toBeNull();
  rewards.drops.push({type: "cache", id: "cache", chance: 1, quantity: 1});
  expect(dungeonRewardError(rewards)).toContain("at most 2000 items");
  rewards.drops[0]!.package!.rewards.reward_items[0]!.quantity = 1e9;
  expect(dungeonRewardError(rewards)).toContain("at most 2000 items");
});

it("rejects scalar overflow from multiplied packages and combined base rewards", () => {
  const rewards = dungeonContent().rewards;
  rewards.drops = [{type: "package", id: "pack", chance: 1, quantity: 100, package: {name: "Bundle", description: "", rewards: ObjectiveReward.parse({reward_exp: 30000000})}}];
  expect(dungeonRewardError(rewards)).toContain("per scalar reward");
  rewards.drops[0]!.package!.rewards.reward_exp = 10000000;
  rewards.experience = 0;
  expect(dungeonRewardError(rewards)).toBeNull();
  rewards.experience = 1;
  expect(dungeonRewardError(rewards)).toContain("per scalar reward");
});
