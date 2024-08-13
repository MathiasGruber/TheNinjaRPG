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
  "userId",
  "villageId",
  "username",
  "gender",
  "avatar",
  "curHealth",
  "clan",
  "maxHealth",
  "longitude",
  "latitude",
  "location",
  "sector",
  "updatedAt",
  "initiative",
  "regeneration",
  "village",
  "level",
  "fledBattle",
  "leftBattle",
  "isOriginal",
  "isAi",
  "iAmHere",
  "controllerId",
  "actionPoints",
  "direction",
  "rank",
  "medicalExperience",
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
  "highestGenerals",
  "strength",
  "intelligence",
  "willpower",
  "speed",
  "bloodline",
  "items",
  "jutsus",
] as const;

export const allState = [...publicState, ...privateState] as const;

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

export const GenNames = ["strength", "intelligence", "willpower", "speed"] as const;
