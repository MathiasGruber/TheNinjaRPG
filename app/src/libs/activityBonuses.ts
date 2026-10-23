import {
  gearMissingMastery,
  isActiveWornGear,
  type MasteryBuffUser,
  type MasteryGear,
  wornGearTags,
} from "@/libs/mastery";
import { hasRequiredSkill } from "@/libs/skillRequirements";

/**
 * Sum flat bonuses from the base bloodline, activated skills and usable worn gear/imbuements.
 * Reads only preloaded relations; callers snapshot the totals when an activity or battle starts.
 */
export const getActivityBonuses = (user: ActivityBonusUser) => {
  const totals = {
    gatheringReductionSeconds: 0,
    farmingReductionSeconds: 0,
    craftingReductionSeconds: 0,
    cookingReductionSeconds: 0,
    huntingBonusQuantity: 0,
  };
  const userSkills = (user.userSkills ?? []).filter(
    (skill) => skill.activated === true,
  );
  const now = new Date();
  const items = (user.items ?? [])
    .filter(hasPassiveGearData)
    .filter(
      (gear) =>
        (gear.quantity === undefined || gear.quantity > 0) &&
        !gear.storedAtHome &&
        !gear.isInAuction &&
        (!gear.craftingFinishedAt || gear.craftingFinishedAt < now),
    );
  // Mastery requirements must use the same active skills and available inventory as the bonuses.
  const wearer = { ...user, userSkills, items };
  const tags = [
    ...(user.bloodline?.effects ?? []),
    ...userSkills.flatMap(({ skill }) =>
      skill.effects.filter(
        (tag) => skill.target === "SELF" || tag.friendlyFire !== "ENEMIES",
      ),
    ),
    ...items
      .filter(
        (gear) =>
          isActiveWornGear(gear, user.bloodlineId) &&
          (user.isAi || hasRequiredSkill(gear.item, wearer)) &&
          !gearMissingMastery(gear, wearer),
      )
      .flatMap(wornGearTags),
  ];
  for (const tag of tags) {
    // Persisted content must still satisfy the flat, self-only, noncombat contract.
    if (
      !Number.isSafeInteger(tag.power) ||
      tag.power < 0 ||
      tag.calculation !== "static" ||
      tag.powerPerLevel !== 0 ||
      tag.target !== "SELF" ||
      tag.rounds !== undefined
    )
      continue;
    switch (tag.type) {
      case "decreasegatheringtime":
        totals.gatheringReductionSeconds += tag.power;
        break;
      case "decreasefarmingtime":
        totals.farmingReductionSeconds += tag.power;
        break;
      case "decreasecraftingtime":
        totals.craftingReductionSeconds += tag.power;
        break;
      case "decreasecookingtime":
        totals.cookingReductionSeconds += tag.power;
        break;
      case "increasehuntingyield":
        totals.huntingBonusQuantity += tag.power;
        break;
    }
  }
  return totals;
};

/** Ignore narrow profile projections that omit the fields needed to establish passive eligibility. */
const hasPassiveGearData = (gear: ActivityBonusGear): gear is MasteryGear =>
  Array.isArray(gear.item.effects) &&
  typeof gear.item.canBeImbued === "boolean" &&
  gear.item.bloodlineId !== undefined;

/** Accept profile rows with partial item data; only complete passive sources contribute. */
type ActivityBonusGear = Omit<MasteryGear, "item"> & {
  item: Pick<MasteryGear["item"], "itemType" | "maxDurability"> &
    Partial<MasteryGear["item"]>;
};
type ActivityBonusUser = Omit<MasteryBuffUser, "items"> & {
  items?: ActivityBonusGear[];
};
