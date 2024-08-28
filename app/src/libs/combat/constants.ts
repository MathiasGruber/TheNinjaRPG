export const COMBAT_WIDTH = 13;
export const COMBAT_HEIGHT = 5;
export const COMBAT_SECONDS = 25;
export const COMBAT_LOBBY_SECONDS = 10;

export const SPAR_EXPIRY_SECONDS = 120;

export const ATK_SCALING = 0.5;
export const DEF_SCALING = 0.5;
export const EXP_SCALING = 0.5;
export const DMG_SCALING = 0.12;
export const GEN_SCALING = 0.5;
export const POWER_SCALING = 0.05;
export const DMG_BASE = 30;

/**
 * Which user state is public
 */
export const publicState = [
  "actionPoints",
  "avatar",
  "bloodline",
  "clan",
  "controllerId",
  "curChakra",
  "curHealth",
  "curStamina",
  "direction",
  "fledBattle",
  "gender",
  "iAmHere",
  "initiative",
  "isAi",
  "isSummon",
  "isOriginal",
  "latitude",
  "leftBattle",
  "level",
  "location",
  "longitude",
  "maxChakra",
  "maxHealth",
  "maxStamina",
  "medicalExperience",
  "rank",
  "regeneration",
  "sector",
  "updatedAt",
  "userId",
  "username",
  "village",
  "villageId",
] as const;

/**
 * Which user state is private
 */
export const privateState = [
  "bloodline",
  "bukijutsuDefence",
  "bukijutsuOffence",
  "genjutsuDefence",
  "genjutsuOffence",
  "highestDefence",
  "highestGenerals",
  "highestOffence",
  "intelligence",
  "items",
  "jutsus",
  "ninjutsuDefence",
  "ninjutsuOffence",
  "speed",
  "strength",
  "taijutsuDefence",
  "taijutsuOffence",
  "updatedAt",
  "willpower",
] as const;

export const allState = [...publicState, ...privateState] as const;

export const StatNames = [
  "bukijutsuDefence",
  "bukijutsuOffence",
  "genjutsuDefence",
  "genjutsuOffence",
  "ninjutsuDefence",
  "ninjutsuOffence",
  "taijutsuDefence",
  "taijutsuOffence",
] as const;

export const GenNames = ["strength", "intelligence", "willpower", "speed"] as const;
