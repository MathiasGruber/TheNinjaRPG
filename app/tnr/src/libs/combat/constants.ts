export const COMBAT_WIDTH = 13;
export const COMBAT_HEIGHT = 4;
export const COMBAT_SECONDS = 10;
export const COMBAT_PREMOVE_SECONDS = 0.5;

/**
 * Which user state is public
 */
export const publicState = [
  "userId",
  "villageId",
  "username",
  "gender",
  "avatar",
  "curHealth",
  "maxHealth",
  "longitude",
  "latitude",
  "location",
  "sector",
  "updatedAt",
  "eloPvp",
  "eloPve",
  "regeneration",
  "village",
  "fledBattle",
  "leftBattle",
  "isOriginal",
  "isAi",
  "controllerId",
] as const;

/**
 * Which user state is private
 */
export const privateState = [
  "updatedAt",
  "curChakra",
  "maxChakra",
  "curStamina",
  "maxStamina",
  "ninjutsuOffence",
  "ninjutsuDefence",
  "genjutsuOffence",
  "genjutsuDefence",
  "taijutsuOffence",
  "taijutsuDefence",
  "bukijutsuOffence",
  "bukijutsuDefence",
  "highestOffence",
  "highestDefence",
  "strength",
  "intelligence",
  "willpower",
  "speed",
  "bloodline",
  "items",
  "jutsus",
] as const;

export const allState = [...publicState, ...privateState] as const;

export const Element = ["Fire", "Water", "Wind", "Earth", "Lightning", "None"] as const;
export const StatType = [
  "Highest",
  "Ninjutsu",
  "Genjutsu",
  "Taijutsu",
  "Bukijutsu",
] as const;
export const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;
export const PoolType = ["Health", "Chakra", "Stamina"] as const;
export const StatNames = [
  "ninjutsuOffence",
  "ninjutsuDefence",
  "genjutsuOffence",
  "genjutsuDefence",
  "taijutsuOffence",
  "taijutsuDefence",
  "bukijutsuOffence",
  "bukijutsuDefence",
] as const;
