export const LetterRanks = ["D", "C", "B", "A", "S", "H"] as const;
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
  "QUEUED",
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
  "OTHER",
] as const;
export type ItemType = (typeof ItemTypes)[number];

export const BanStates = [
  "UNVIEWED",
  "REPORT_CLEARED",
  "BAN_ACTIVATED",
  "SILENCE_ACTIVATED",
  "BAN_ESCALATED",
  "SILENCE_ESCALATED",
  "OFFICIAL_WARNING",
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

export const BattleTypes = [
  "ARENA",
  "COMBAT",
  "SPARRING",
  "KAGE_CHALLENGE",
  "CLAN_CHALLENGE",
  "CLAN_BATTLE",
  "TOURNAMENT",
  "QUEST",
] as const;
export type BattleType = (typeof BattleTypes)[number];

export const TournamentTypes = ["CLAN"] as const;
export type TournamentType = (typeof TournamentTypes)[number];

export const TournamentStates = ["OPEN", "IN_PROGRESS", "COMPLETED"] as const;
export type TournamentState = (typeof TournamentStates)[number];

export const TournamentMatchStates = ["WAITING", "PLAYED", "NO_SHOW"] as const;
export type TournamentMatchState = (typeof TournamentMatchStates)[number];

export const AutoBattleTypes = ["KAGE_CHALLENGE", "CLAN_CHALLENGE"];

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
  "CLAN",
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
export const RYO_CAP = 1000000000;
export const MAX_STATS_CAP = 300000;
export const MAX_GENS_CAP = 150000;

// Caps lookup table
export const USER_CAPS: {
  [key in UserRank]: { GENS_CAP: number; STATS_CAP: number; LVL_CAP: number };
} = {
  STUDENT: { GENS_CAP: 20000, STATS_CAP: 20000, LVL_CAP: 10 },
  GENIN: { GENS_CAP: 20000, STATS_CAP: 20000, LVL_CAP: 20 },
  CHUNIN: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  JONIN: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  COMMANDER: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  ELDER: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  NONE: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
} as const;

// Reputation cost config
export const COST_CHANGE_USERNAME = 5;
export const COST_CUSTOM_TITLE = 5;
export const COST_SWAP_BLOODLINE = 0; // TODO: Should be determined by rank
export const COST_SWAP_VILLAGE = 0; // TODO: Should be 5
export const COST_RESET_STATS = 15;
export const COST_EXTRA_ITEM_SLOT = 10;
export const COST_REROLL_ELEMENT = 20;

// Village config
export const VILLAGE_LEAVE_REQUIRED_RANK = "CHUNIN";
export const VILLAGE_REDUCED_GAINS_DAYS = 7;
export const VILLAGE_SYNDICATE_ID = "ryBk0qD4EgvPPyav2K4OC";

// ANBU config
export const ANBU_MEMBER_RANK_REQUIREMENT = "CHUNIN";
export const ANBU_LEADER_RANK_REQUIREMENT = "JONIN";
export const ANBU_MAX_MEMBERS = 20;
export const ANBU_HOSPITAL_DISCOUNT_PERC = 5;
export const ANBU_ITEMSHOP_DISCOUNT_PERC = 5;

// Sensei config
export const SENSEI_RANKS = ["JONIN", "COMMANDER", "ELDER"];

// Medical Ninja config
export const MEDNIN_HEALABLE_STATES = ["HOSPITALIZED", "AWAKE"] as const;
export const MEDNIN_MIN_RANK = "GENIN";
export const MEDNIN_RANKS = ["NONE", "NOVICE", "APPRENTICE", "MASTER"] as const;
export const MEDNIN_HEAL_TO_EXP = 0.1;
export type MEDNIN_RANK = (typeof MEDNIN_RANKS)[number];
export const MEDNIN_REQUIRED_EXP = {
  NONE: 0,
  NOVICE: 0,
  APPRENTICE: 200000,
  MASTER: 400000,
} as { [key in MEDNIN_RANK]: number };

// Training config
export const JUTSU_XP_TO_LEVEL = 1000;
export const JUTSU_LEVEL_CAP = 20;
export const JUTSU_TRAIN_LEVEL_CAP = 25;

// Combat config
export const BATTLE_ARENA_DAILY_LIMIT = 100;
export const RANKS_RESTRICTED_FROM_PVP = ["STUDENT", "GENIN"];

// Black market config
export const RYO_FOR_REP_DAYS_FROZEN = 7;
export const RYO_FOR_REP_DAYS_AUTO_DELIST = 30;

// Reputation purchase config
export const MAX_REPS_PER_MONTH = 1000;

// Federal config
export const FED_NORMAL_REPS_COST = 15;
export const FED_SILVER_REPS_COST = 35;
export const FED_GOLD_REPS_COST = 50;
export const FED_NORMAL_BANK_INTEREST = 2;
export const FED_SILVER_BANK_INTEREST = 5;
export const FED_GOLD_BANK_INTEREST = 8;
export const FED_NORMAL_INVENTORY_SLOTS = 2;
export const FED_SILVER_INVENTORY_SLOTS = 5;
export const FED_GOLD_INVENTORY_SLOTS = 10;
export const FED_NORMAL_JUTSU_SLOTS = 1;
export const FED_SILVER_JUTSU_SLOTS = 2;
export const FED_GOLD_JUTSU_SLOTS = 3;
export const FED_NORMAL_JUTSU_LOADOUTS = 1;
export const FED_SILVER_JUTSU_LOADOUTS = 2;
export const FED_GOLD_JUTSU_LOADOUTS = 3;

// Missions config
export const MISSIONS_PER_DAY = 50;

// Clans config
export const CLAN_CREATE_PRESTIGE_REQUIREMENT = 100;
export const CLAN_CREATE_RYO_COST = 1000000;
export const CLAN_RANK_REQUIREMENT = "CHUNIN";
export const CLAN_MAX_MEMBERS = 50;
export const CLAN_LOBBY_SECONDS = 120 * 10000;
export const CLAN_BATTLE_REWARD_POINTS = 50;
export const MAX_TRAINING_BOOST = 15;
export const MAX_RYO_BOOST = 15;
export const TRAINING_BOOST_COST = 300;
export const RYO_BOOST_COST = 100;

// Tournament Config
export const TOURNAMENT_ROUND_SECONDS = 30 * 60;

// Images
export const DEFAULT_IMAGE =
  "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp";

// Training gains
export const GAME_SETTING_GAINS_MULTIPLIER = ["0", "2", "4", "8"] as const;

// Map settings
export const SECTOR_TYPES = ["VILLAGE", "OUTLAW", "SAFEZONE"] as const;
