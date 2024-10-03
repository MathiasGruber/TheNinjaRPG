import type {
  UserData,
  Bloodline,
  Village,
  VillageStructure,
  GameSetting,
} from "@/drizzle/schema";
import { USER_CAPS, HP_PER_LVL, SP_PER_LVL, CP_PER_LVL } from "@/drizzle/constants";
import { capitalizeFirstLetter } from "@/utils/sanitize";
import { structureBoost } from "@/utils/village";
import { getReducedGainsDays } from "@/libs/train";
import { getGameSettingBoost } from "@/libs/gamesettings";
import type { UserRank } from "@/drizzle/constants";
import type { StatSchemaType } from "./combat/types";

export function calcLevelRequirements(level: number): number {
  const prevLvl = level - 1;
  const factor = level > 80 ? 950 : 500;
  const cost = factor + prevLvl * factor;
  const prevCost = prevLvl > 0 ? calcLevelRequirements(prevLvl) : 0;
  return cost + prevCost;
}

export const calcLevel = (experience: number) => {
  let level = 1;
  let exp = 0;
  while (exp < experience) {
    const factor = level > 80 ? 950 : 500;
    exp += factor + level * factor;
    if (exp < experience) {
      level += 1;
    }
  }
  return level;
};

export const calcHP = (level: number) => {
  return 100 + HP_PER_LVL * (level - 1);
};

export const calcSP = (level: number) => {
  return 100 + SP_PER_LVL * (level - 1);
};

export const calcCP = (level: number) => {
  return 100 + CP_PER_LVL * (level - 1);
};

type StatDistribution = {
  ninjutsuOffence: number;
  ninjutsuDefence: number;
  genjutsuOffence: number;
  genjutsuDefence: number;
  taijutsuOffence: number;
  taijutsuDefence: number;
  bukijutsuOffence: number;
  bukijutsuDefence: number;
  strength: number;
  intelligence: number;
  willpower: number;
  speed: number;
};

export function capUserStats(user: UserData) {
  const stats_cap = USER_CAPS[user.rank].STATS_CAP;
  const gens_cap = USER_CAPS[user.rank].GENS_CAP;
  if (user.ninjutsuOffence > stats_cap) user.ninjutsuOffence = stats_cap;
  if (user.genjutsuOffence > stats_cap) user.genjutsuOffence = stats_cap;
  if (user.taijutsuOffence > stats_cap) user.taijutsuOffence = stats_cap;
  if (user.bukijutsuOffence > stats_cap) user.bukijutsuOffence = stats_cap;
  if (user.ninjutsuDefence > stats_cap) user.ninjutsuDefence = stats_cap;
  if (user.genjutsuDefence > stats_cap) user.genjutsuDefence = stats_cap;
  if (user.taijutsuDefence > stats_cap) user.taijutsuDefence = stats_cap;
  if (user.bukijutsuDefence > stats_cap) user.bukijutsuDefence = stats_cap;
  if (user.strength > gens_cap) user.strength = gens_cap;
  if (user.speed > gens_cap) user.speed = gens_cap;
  if (user.intelligence > gens_cap) user.intelligence = gens_cap;
  if (user.willpower > gens_cap) user.willpower = gens_cap;
}

/** Scale stats of user, and return total number of experience / stat points */
export function scaleUserStats(user: UserData) {
  // Pools
  user["curHealth"] = calcHP(user.level);
  user["maxHealth"] = calcHP(user.level);
  user["curStamina"] = calcSP(user.level);
  user["maxStamina"] = calcSP(user.level);
  user["curChakra"] = calcCP(user.level);
  user["maxChakra"] = calcCP(user.level);
  // Stats
  const exp = calcLevelRequirements(user.level) - 500;
  user["experience"] = exp;
  const sum = [
    user.ninjutsuOffence ?? 0,
    user.ninjutsuDefence ?? 0,
    user.genjutsuOffence ?? 0,
    user.genjutsuDefence ?? 0,
    user.taijutsuOffence ?? 0,
    user.taijutsuDefence ?? 0,
    user.bukijutsuOffence ?? 0,
    user.bukijutsuDefence ?? 0,
    user.strength ?? 0,
    user.intelligence ?? 0,
    user.willpower ?? 0,
    user.speed ?? 0,
  ].reduce((a, b) => a + b, 0);
  const calcStat = (stat: keyof StatDistribution) => {
    return 10 + Math.floor(((user[stat] ?? 0) / sum) * exp * 100) / 100;
  };
  user["ninjutsuOffence"] = calcStat("ninjutsuOffence");
  user["ninjutsuDefence"] = calcStat("ninjutsuDefence");
  user["genjutsuOffence"] = calcStat("genjutsuOffence");
  user["genjutsuDefence"] = calcStat("genjutsuDefence");
  user["taijutsuOffence"] = calcStat("taijutsuOffence");
  user["taijutsuDefence"] = calcStat("taijutsuDefence");
  user["bukijutsuOffence"] = calcStat("bukijutsuOffence");
  user["bukijutsuDefence"] = calcStat("bukijutsuDefence");
  user["strength"] = calcStat("strength");
  user["intelligence"] = calcStat("intelligence");
  user["willpower"] = calcStat("willpower");
  user["speed"] = calcStat("speed");
}

/** Assign stats of user, meant for the training dummy */
export function manuallyAssignUserStats(user: UserData, stats: StatSchemaType) {
  // Stats
  user["ninjutsuOffence"] = stats.ninjutsuOffence;
  user["ninjutsuDefence"] = stats.ninjutsuDefence;
  user["genjutsuOffence"] = stats.genjutsuOffence;
  user["genjutsuDefence"] = stats.genjutsuDefence;
  user["taijutsuOffence"] = stats.taijutsuOffence;
  user["taijutsuDefence"] = stats.taijutsuDefence;
  user["bukijutsuOffence"] = stats.bukijutsuOffence;
  user["bukijutsuDefence"] = stats.bukijutsuDefence;
  user["strength"] = stats.strength;
  user["intelligence"] = stats.intelligence;
  user["willpower"] = stats.willpower;
  user["speed"] = stats.speed;
}

export const activityStreakRewards = (streak: number) => {
  const rewards = { money: streak * 100, reputationPoints: 0 };
  if (streak % 10 === 0) {
    rewards["reputationPoints"] = Math.floor(streak / 10);
  }
  return rewards;
};

export const showUserRank = (user: { rank: UserRank; isOutlaw: boolean }) => {
  if (!user) return "Unknown";
  if (user.isOutlaw) {
    switch (user.rank) {
      case "CHUNIN":
        return "Lower Outlaw";
      case "JONIN":
        return "Higher Outlaw";
      case "COMMANDER":
        return "Special Outlaw";
      case "ELDER":
        return "Outlaw Council";
    }
  }
  return capitalizeFirstLetter(user.rank);
};

// Calculate user stats
export const deduceActiveUserRegen = (
  user: UserData & {
    bloodline?: Bloodline | null;
    village?: (Village & { structures?: VillageStructure[] }) | null;
  },
  settings: GameSetting[],
) => {
  let regeneration = user.regeneration;

  // // Bloodline
  if (user.bloodline?.regenIncrease) {
    regeneration = regeneration + user.bloodline.regenIncrease;
  }

  // // Calculate percentage boost
  let boost = structureBoost("regenIncreasePerLvl", user?.village?.structures);
  if (user.status === "ASLEEP") {
    boost += structureBoost("sleepRegenPerLvl", user.village?.structures);
  }
  regeneration *= (100 + boost) / 100;

  // Reduce regen if just joined village
  const reducedDays = getReducedGainsDays(user);
  if (reducedDays > 0) {
    regeneration *= 0.5;
  }

  // Increase by event
  const setting = getGameSettingBoost("regenGainMultiplier", settings);
  const gameFactor = setting?.value || 1;
  regeneration *= gameFactor;

  return regeneration;
};
