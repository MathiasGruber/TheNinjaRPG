export const LetterRanks = ["D", "C", "B", "A", "S"] as const;
export type LetterRank = (typeof LetterRanks)[number];

export const StatTypes = [
  "Highest",
  "Ninjutsu",
  "Genjutsu",
  "Taijutsu",
  "Bukijutsu",
] as const;
export type StatType = (typeof StatTypes)[number];

export const GeneralType = ["Strength", "Intelligence", "Willpower", "Speed"] as const;

export const PoolType = ["Health", "Chakra", "Stamina"] as const;

export const ItemRarities = ["COMMON", "RARE", "EPIC", "LEGENDARY"] as const;

export const ItemSlotTypes = [
  "HEAD",
  "CHEST",
  "LEGS",
  "FEET",
  "HAND",
  "ITEM",
  "NONE",
] as const;

export const ItemSlots = [
  "HEAD",
  "CHEST",
  "LEGS",
  "FEET",
  "HAND_1",
  "HAND_2",
  "ITEM_1",
  "ITEM_2",
  "ITEM_3",
  "ITEM_4",
  "ITEM_5",
  "ITEM_6",
  "ITEM_7",
  "NONE",
] as const;

export const UserRoles = [
  "USER",
  "MODERATOR",
  "CONTENT",
  "EVENT",
  "ADMIN",
  "CONTENT-ADMIN",
] as const;
export type UserRole = (typeof UserRoles)[number];

export const UserStatuses = [
  "AWAKE",
  "HOSPITALIZED",
  "TRAVEL",
  "BATTLE",
  "ASLEEP",
] as const;

export const FederalStatuses = ["NONE", "NORMAL", "SILVER", "GOLD"] as const;
export type FederalStatus = (typeof FederalStatuses)[number];

export const UserRanks = [
  "STUDENT",
  "GENIN",
  "CHUNIN",
  "JONIN",
  "COMMANDER",
  "ELDER",
  "NONE",
] as const;
export type UserRank = (typeof UserRanks)[number];

export const ItemTypes = [
  "WEAPON",
  "CONSUMABLE",
  "ARMOR",
  "ACCESSORY",
  "MATERIAL",
  "EVENT",
  "OTHER",
] as const;

export const WeaponTypes = [
  "STAFF",
  "AXE",
  "FIST_WEAPON",
  "SHURIKEN",
  "SICKLE",
  "DAGGER",
  "SWORD",
  "POLEARM",
  "FLAIL",
  "CHAIN",
  "FAN",
  "BOW",
  "HAMMER",
  "NONE",
] as const;

export const AttackTargets = [
  "SELF",
  "OTHER_USER",
  "OPPONENT",
  "ALLY",
  "CHARACTER",
  "GROUND",
  "EMPTY_GROUND",
] as const;

export const AttackMethods = [
  "SINGLE",
  "ALL",
  "AOE_CIRCLE_SPAWN",
  "AOE_LINE_SHOOT",
  "AOE_CIRCLE_SHOOT",
  "AOE_SPIRAL_SHOOT",
] as const;

export const JutsuTypes = [
  "NORMAL",
  "SPECIAL",
  "BLOODLINE",
  "FORBIDDEN",
  "LOYALTY",
  "CLAN",
  "EVENT",
  "AI",
] as const;

export const UserStatNames = [
  "ninjutsuOffence",
  "taijutsuOffence",
  "genjutsuOffence",
  "bukijutsuOffence",
  "ninjutsuDefence",
  "taijutsuDefence",
  "genjutsuDefence",
  "bukijutsuDefence",
  "strength",
  "speed",
  "intelligence",
  "willpower",
] as const;

export const BattleTypes = ["ARENA", "COMBAT", "SPARRING", "KAGE"] as const;
export type BattleType = (typeof BattleTypes)[number];

export const BattleDataEntryType = [
  "jutsu",
  "item",
  "bloodline",
  "basic",
  "ai",
] as const;

export const TimeFrames = ["daily", "weekly", "monthly", "all_time"] as const;

export const QuestTypes = [
  "mission",
  "crime",
  "event",
  "exam",
  "errand",
  "tier",
  "daily",
  "achievement",
] as const;
export type QuestType = (typeof QuestTypes)[number];

export const SmileyEmotions = ["like", "love", "laugh"] as const;

export const TrainingSpeeds = ["15min", "1hr", "4hrs", "8hrs"] as const;
export type TrainingSpeed = (typeof TrainingSpeeds)[number];

export const UserRequestStates = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type UserRequestState = (typeof UserRequestStates)[number];

export const UserRequestTypes = [
  "SPAR",
  "ALLIANCE",
  "SURRENDER",
  "SENSEI",
  "ANBU",
] as const;
export type UserRequestType = (typeof UserRequestTypes)[number];

export const AllianceStates = ["NEUTRAL", "ALLY", "ENEMY"] as const;
export type AllianceState = (typeof AllianceStates)[number];

export const BasicElementName = [
  "Fire",
  "Water",
  "Wind",
  "Earth",
  "Lightning",
] as const;

export const ElementNames = [
  ...BasicElementName,
  "Ice",
  "Crystal",
  "Dust",
  "Shadow",
  "Wood",
  "Scorch",
  "Storm",
  "Magnet",
  "Yin-Yang",
  "Lava",
  "Explosion",
  "Light",
] as const;
export type ElementName = (typeof ElementNames)[number];

// User stats config
export const HP_PER_LVL = 50;
export const SP_PER_LVL = 50;
export const CP_PER_LVL = 50;
export const MAX_ATTRIBUTES = 5;
export const STATS_CAP = 300000;
export const GENS_CAP = 150000;

// Reputation cost config
export const COST_CHANGE_USERNAME = 5;
export const COST_SWAP_BLOODLINE = 0; // TODO: Should be determined by rank
export const COST_SWAP_VILLAGE = 0; // TODO: Should be 5
export const COST_RESET_STATS = 0; // TODO: Should be 5

// ANBU config
export const ANBU_MEMBER_RANK_REQUIREMENT = "CHUNIN";
export const ANBU_LEADER_RANK_REQUIREMENT = "JONIN";
export const ANBU_MAX_MEMBERS = 20;
export const ANBU_HOSPITAL_DISCOUNT_PERC = 5;
export const ANBU_ITEMSHOP_DISCOUNT_PERC = 5;

// Sensei config
export const SENSEI_RANKS = ["JONIN", "COMMANDER", "ELDER"];

// Medical Ninja config
export const MEDNIN_MIN_RANK = "GENIN";
export const MEDNIN_RANKS = ["NONE", "NOVICE", "APPRENTICE", "MASTER"] as const;
export const MEDNIN_HEAL_TO_EXP = 0.1;
export type MEDNIN_RANK = (typeof MEDNIN_RANKS)[number];
export const MEDNIN_REQUIRED_EXP = {
  NONE: 0,
  NOVICE: 0,
  APPRENTICE: 5000,
  MASTER: 10000,
} as { [key in MEDNIN_RANK]: number };

// Training config
export const JUTSU_XP_TO_LEVEL = 1000;

// Combat config
export const RANKS_RESTRICTED_FROM_PVP = ["STUDENT", "GENIN"];
