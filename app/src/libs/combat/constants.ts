export const COMBAT_WIDTH = 13;
export const COMBAT_HEIGHT = 4;
export const COMBAT_SECONDS = 10;
export const COMBAT_LOBBY_SECONDS = 20;

export const ATK_SCALING = 0.5;
export const DEF_SCALING = 0.5;
export const EXP_SCALING = 0.5;
export const DMG_SCALING = 0.3;
export const GEN_SCALING = 1;
export const POWER_SCALING = 0.01;
export const DMG_BASE = 10;

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
  "actionPoints",
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
