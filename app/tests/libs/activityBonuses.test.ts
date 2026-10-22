import { describe, expect, it } from "bun:test";
import { getActivityBonuses } from "@/libs/activityBonuses";
import type { MasteryBuffUser, MasteryGear } from "@/libs/mastery";
import {
  DecreaseCookingTime,
  DecreaseCraftingTime,
  DecreaseFarmingTime,
  DecreaseGatheringTime,
  IncreaseHuntingYield,
} from "@/validators/combat";

const bonus = (power = 10) => DecreaseGatheringTime.parse({ power });
const user = (): MasteryBuffUser => ({
  level: 50,
  bloodlineId: "bloodline",
  rank: "JONIN",
  ninjutsuMastery: 100,
  genjutsuMastery: 100,
  taijutsuMastery: 100,
  bukijutsuMastery: 100,
  bloodlineMastery: 100,
  sageMastery: 100,
  bloodline: { effects: [bonus()] },
  userSkills: [
    {
      skillId: "skill",
      activated: true,
      skill: { target: "SELF", effects: [bonus(15)] },
    },
  ],
  items: [gear()],
});
const gear = (): MasteryGear => ({
  id: "gear",
  equipped: "CHEST",
  quantity: 1,
  durability: 100,
  level: 1,
  item: {
    itemType: "ARMOR",
    maxDurability: 100,
    bloodlineId: null,
    canBeImbued: true,
    effects: [bonus(20)],
  },
  imbuements: [{ craftingFinishedAt: new Date(0), item: { effects: [bonus(5)] } }],
});

describe("activity passive sources", () => {
  it("adds bloodline, activated skills, eligible gear and finished imbuements", () => {
    expect(getActivityBonuses(user())).toEqual({
      gatheringReductionSeconds: 50,
      farmingReductionSeconds: 0,
      craftingReductionSeconds: 0,
      cookingReductionSeconds: 0,
      huntingBonusQuantity: 0,
    });
  });
  it("reports independent totals without level scaling", () => {
    const player = user();
    player.bloodline!.effects.push(
      DecreaseFarmingTime.parse({ power: 1 }),
      DecreaseCraftingTime.parse({ power: 2 }),
      DecreaseCookingTime.parse({ power: 3 }),
      IncreaseHuntingYield.parse({ power: 4 }),
    );
    expect(getActivityBonuses({ ...player, level: 100 })).toMatchObject({
      farmingReductionSeconds: 1,
      craftingReductionSeconds: 2,
      cookingReductionSeconds: 3,
      huntingBonusQuantity: 4,
    });
  });
  it.each([
    { equipped: "NONE" },
    { durability: 0 },
    { quantity: 0 },
    { storedAtHome: true },
    { isInAuction: true },
    { craftingFinishedAt: new Date(Date.now() + 3600_000) },
  ])("ignores unusable gear and its imbuements: %j", (patch) => {
    expect(
      getActivityBonuses({ ...user(), items: [{ ...gear(), ...patch }] })
        .gatheringReductionSeconds,
    ).toBe(25);
  });
  it("requires the gear's bloodline, skill and mastery", () => {
    for (const patch of [
      { bloodlineId: "other" },
      { requiredSkillId: "missing" },
      { requiredNinjutsuMastery: 101 },
    ]) {
      const piece = gear();
      Object.assign(piece.item, patch);
      expect(
        getActivityBonuses({ ...user(), items: [piece] }).gatheringReductionSeconds,
      ).toBe(25);
    }
    const piece = gear();
    piece.item.requiredSkillId = "skill";
    expect(
      getActivityBonuses({ ...user(), items: [piece] }).gatheringReductionSeconds,
    ).toBe(50);
  });
  it("ignores inactive skills and ineligible imbuements", () => {
    const player = user();
    player.userSkills![0]!.activated = undefined;
    expect(getActivityBonuses(player).gatheringReductionSeconds).toBe(35);
    player.userSkills![0]!.activated = false;
    expect(getActivityBonuses(player).gatheringReductionSeconds).toBe(35);
    player.items![0]!.imbuements![0]!.craftingFinishedAt = new Date(
      Date.now() + 3600_000,
    );
    expect(getActivityBonuses(player).gatheringReductionSeconds).toBe(30);
    player.items![0]!.imbuements![0]!.craftingFinishedAt = null;
    expect(getActivityBonuses(player).gatheringReductionSeconds).toBe(30);
    player.items![0]!.imbuements![0]!.craftingFinishedAt = new Date(0);
    player.items![0]!.item.canBeImbued = false;
    expect(getActivityBonuses(player).gatheringReductionSeconds).toBe(30);
  });
});
