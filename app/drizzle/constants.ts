export const GameAssetTypes = ["STATIC", "ANIMATION"] as const;
export type GameAssetType = (typeof GameAssetTypes)[number];

export const LetterRanks = ["D", "C", "B", "A", "S", "H"] as const;
export type LetterRank = (typeof LetterRanks)[number];

export const LOG_TYPES = [
  "ai",
  "user",
  "jutsu",
  "bloodline",
  "item",
  "badge",
  "clan",
] as const;
export type LogType = (typeof LOG_TYPES)[number];

export const StatTypes = [
  "Highest",
  "Ninjutsu",
  "Genjutsu",
  "Taijutsu",
  "Bukijutsu",
] as const;
export type StatType = (typeof StatTypes)[number];

export const GeneralTypes = [
  "Highest",
  "Strength",
  "Intelligence",
  "Willpower",
  "Speed",
] as const;
export type GeneralType = (typeof GeneralTypes)[number];

export const PoolTypes = ["Health", "Chakra", "Stamina"] as const;
export type PoolType = (typeof PoolTypes)[number];

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

export const StructureRoutes = [
  "",
  "/adminbuilding",
  "/anbu",
  "/bank",
  "/battlearena",
  "/blackmarket",
  "/clanhall",
  "/home",
  "/hospital",
  "/itemshop",
  "/missionhall",
  "/ramenshop",
  "/science",
  "/souvenirs",
  "/townhall",
  "/traininggrounds",
] as const;
export type StructureRoute = (typeof StructureRoutes)[number];

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
export type ItemSlot = (typeof ItemSlots)[number];

export const AutomoderationCategories = [
  "comment",
  "privateMessage",
  "forumPost",
  "userReport",
  "userNindo",
  "clanOrder",
  "anbuOrder",
  "kageOrder",
  "userAvatar",
] as const;
export type AutomoderationCategory = (typeof AutomoderationCategories)[number];

export const UserRoles = [
  "USER",
  "CODING-ADMIN",
  "CONTENT-ADMIN",
  "MODERATOR-ADMIN",
  "HEAD_MODERATOR",
  "MODERATOR",
  "CONTENT",
  "EVENT",
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
export type UserStatus = (typeof UserStatuses)[number];

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
export type BanState = (typeof BanStates)[number];

export const TERR_BOT_ID = "iDoQgjrffFd81z8dCYdw7";

export const TimeUnits = ["minutes", "hours", "days", "weeks", "months"] as const;
export type TimeUnit = (typeof TimeUnits)[number];

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
export type AttackTarget = (typeof AttackTargets)[number];

export const AttackMethods = [
  "SINGLE",
  "ALL",
  "AOE_CIRCLE_SPAWN",
  "AOE_LINE_SHOOT",
  "AOE_WALL_SHOOT",
  "AOE_CIRCLE_SHOOT",
  "AOE_SPIRAL_SHOOT",
] as const;
export type AttackMethod = (typeof AttackMethods)[number];

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
export type UserStatName = (typeof UserStatNames)[number];

export const BattleTypes = [
  "ARENA",
  "COMBAT",
  "SPARRING",
  "KAGE_CHALLENGE",
  "CLAN_CHALLENGE",
  "CLAN_BATTLE",
  "TOURNAMENT",
  "QUEST",
  "VILLAGE_PROTECTOR",
  "TRAINING",
] as const;
export type BattleType = (typeof BattleTypes)[number];

export const PvpBattleTypes: BattleType[] = [
  "COMBAT",
  "SPARRING",
  "CLAN_BATTLE",
  "TOURNAMENT",
];

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
export type TimeFrame = (typeof TimeFrames)[number];

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

export const UserAssociations = ["MARRIAGE", "DIVORCED"] as const;

export type UserAssociation = (typeof UserAssociations)[number];

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
  "MARRIAGE",
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
  "None",
] as const;
export type ElementName = (typeof ElementNames)[number];

// User stats config
export const HP_PER_LVL = 50;
export const SP_PER_LVL = 50;
export const CP_PER_LVL = 50;
export const MAX_ATTRIBUTES = 5;
export const RYO_CAP = 1000000000;
export const MAX_STATS_CAP = 450000;
export const MAX_GENS_CAP = 200000;

export const ROLL_CHANCE = {
  ["H"]: 0,
  ["S"]: 0.005,
  ["A"]: 0.015,
  ["B"]: 0.065,
  ["C"]: 0.315,
  ["D"]: 0.615,
} as const;

export const ROLL_CHANCE_PERCENTAGE = {
  ["H"]: 0,
  ["S"]: 0.005,
  ["A"]: 0.01,
  ["B"]: 0.05,
  ["C"]: 0.25,
  ["D"]: 0.3,
} as const;

// Bloodline Pricing
export const BLOODLINE_COST = {
  ["H"]: 999999,
  ["S"]: 999999,
  ["A"]: 200,
  ["B"]: 190,
  ["C"]: 180,
  ["D"]: 170,
} as const;

export const REMOVAL_COST = 5;

// Bank config
export const BankTransferTypes = ["bank", "sensei", "recruiter"] as const;

// Caps lookup table
export const USER_CAPS: {
  [key in UserRank]: { GENS_CAP: number; STATS_CAP: number; LVL_CAP: number };
} = {
  STUDENT: { GENS_CAP: 20000, STATS_CAP: 20000, LVL_CAP: 10 },
  GENIN: { GENS_CAP: 40000, STATS_CAP: 40000, LVL_CAP: 20 },
  CHUNIN: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  JONIN: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  COMMANDER: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  ELDER: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
  NONE: { GENS_CAP: MAX_GENS_CAP, STATS_CAP: MAX_STATS_CAP, LVL_CAP: 100 },
} as const;

// Reputation cost config
export const COST_CHANGE_USERNAME = 5;
export const COST_CUSTOM_TITLE = 5;
export const COST_SWAP_BLOODLINE = 0;
export const COST_SWAP_VILLAGE = 0;
export const COST_RESET_STATS = 15;
export const COST_EXTRA_ITEM_SLOT = 10;
export const COST_EXTRA_JUTSU_SLOT = 50;
export const COST_REROLL_ELEMENT = 20;
export const MAX_EXTRA_JUTSU_SLOTS = 2;
export const BLOODLINE_ROLL_TYPES = ["NATURAL", "ITEM"] as const;

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
export const SENSEI_STUDENT_RYO_PER_MISSION = 100;

// Medical Ninja config
export const MEDNIN_HEALABLE_STATES = ["HOSPITALIZED", "AWAKE"] as const;
export const MEDNIN_MIN_RANK = "GENIN";
export const MEDNIN_RANKS = ["NONE", "NOVICE", "APPRENTICE", "MASTER"] as const;
export const MEDNIN_HEAL_TO_EXP = 0.1;
export type MEDNIN_RANK = (typeof MEDNIN_RANKS)[number];
export const MEDNIN_REQUIRED_EXP = {
  NONE: 0,
  NOVICE: 0,
  APPRENTICE: 100000,
  MASTER: 400000,
} as { [key in MEDNIN_RANK]: number };

// Training config
export const JUTSU_XP_TO_LEVEL = 1000;
export const JUTSU_LEVEL_CAP = 20;
export const JUTSU_TRAIN_LEVEL_CAP = 25;
export const MAX_DAILY_TRAININGS = 64;

// Combat config
export const BATTLE_ARENA_DAILY_LIMIT = 40;
export const BATTLE_TAG_STACKING = true;
export const RANKS_RESTRICTED_FROM_PVP = ["STUDENT", "GENIN"];

// Black market config
export const RYO_FOR_REP_DAYS_FROZEN = 3;
export const RYO_FOR_REP_DAYS_AUTO_DELIST = 30;
export const RYO_FOR_REP_MAX_LISTINGS = 5;
export const RYO_FOR_REP_MIN_REPS = 5;
export const PITY_BLOODLINE_ROLLS = 200;
export const PITY_SYSTEM_ENABLED = true;

// Reputation purchase config
export const MAX_REPS_PER_MONTH = 4000;

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
export const MISSIONS_PER_DAY = 9;

// Clans config
export const CLAN_CREATE_PRESTIGE_REQUIREMENT = 100;
export const CLAN_CREATE_RYO_COST = 1000000;
export const CLAN_RANK_REQUIREMENT = "GENIN";
export const CLAN_MAX_MEMBERS = 50;
export const CLANS_PER_STRUCTURE_LEVEL = 3;
export const CLAN_LOBBY_SECONDS = 30;
export const CLAN_BATTLE_REWARD_POINTS = 50;
export const MAX_TRAINING_BOOST = 15;
export const MAX_RYO_BOOST = 15;
export const TRAINING_BOOST_COST = 300;
export const RYO_BOOST_COST = 100;

// Tournament Config
export const TOURNAMENT_ROUND_SECONDS = 30 * 60;

// Training gains
export const GAME_SETTING_GAINS_MULTIPLIER = ["0", "2", "4", "8"] as const;

// Map settings
export const SECTOR_TYPES = ["VILLAGE", "OUTLAW", "SAFEZONE"] as const;

// Conversation config
export const CONVERSATION_QUIET_MINS = 5;
export const REPORT_CONTEXT_WINDOW = 10;

// Kage config
export const KAGE_PRESTIGE_REQUIREMENT = 4000;
export const KAGE_RANK_REQUIREMENT = "JONIN";
export const KAGE_PRESTIGE_COST = 1000;
export const FRIENDLY_PRESTIGE_COST = 10000;
export const WAR_FUNDS_COST = 100;
export const KAGE_MAX_DAILIES = 3;
export const KAGE_MAX_ELDERS = 5;
export const KAGE_DELAY_SECS = 24 * 3600;

// Game assets
export const ID_ANIMATION_SMOKE = "gkYHdSzsHu";
export const ID_ANIMATION_HIT = "oh4kVNrAwF";
export const ID_ANIMATION_HEAL = "I9aYhT5wMB";

// Images
export const IMG_AVATAR_DEFAULT =
  "https://utfs.io/f/630cf6e7-c152-4dea-a3ff-821de76d7f5a_default.webp";
export const IMG_WALLPAPER_WINTER =
  "https://utfs.io/f/f2d97eb9-a4e1-4ccc-8256-5a5f6cb7a6a1-o5u8s0.webp";
export const IMG_WALLPAPER_SPRING =
  "https://utfs.io/f/20131551-db19-44c8-ab76-31e1ed3069c8-mdknco.webp";
export const IMG_WALLPAPER_SUMMER =
  "https://utfs.io/f/5f637e42-b2e3-4fdd-9b96-578d0f729fb0-mg8i56.webp";
export const IMG_WALLPAPER_FALL =
  "https://utfs.io/f/e6f437e0-1cfa-4986-b9e5-bb4957ff3813-ul0asa.webp";
export const IMG_WALLPAPER_HALLOWEEN =
  "https://utfs.io/f/Hzww9EQvYURJ7dGuA2BXKPBOUWGyFuM4DlL1v5HNTZhkte0z";
export const IMG_LAYOUT_NAVBAR =
  "https://utfs.io/f/Hzww9EQvYURJ1znttRb6bo95WClq4K0wxZUmJcvThgdVenO3";
export const IMG_LAYOUT_NAVBAR_HALLOWEEN =
  "https://utfs.io/f/Hzww9EQvYURJbYxvuGAtYUndMi56GkX19q0A4PzyeIloBrEa";
export const IMG_LAYOUT_HANDSIGN =
  "https://utfs.io/f/Hzww9EQvYURJ0hKI3IgrYldRWJcD6vE10SjNsXHeA9pVMfQi";
export const IMG_LAYOUT_HANDSIGN_HALLOWEEN =
  "https://utfs.io/f/Hzww9EQvYURJcGYTUXSnxBpQqGNDcTHbLmYz8uXAl3oa54ti";

export const IMG_LOGO_FULL =
  "https://utfs.io/f/5a8a34a2-b126-4674-b95d-db37a14b028e-1zbfv.webp";
export const IMG_LOGO_SHORT =
  "https://utfs.io/f/c7486cf8-83ac-4fee-a451-a0faffc4cc58-io417c.webp";
export const IMG_LOADER =
  "https://utfs.io/f/4a3100e5-97c6-4e5a-96e2-1c3520838179-gwm3dh.svg";
export const IMG_SECTOR_INFO =
  "https://utfs.io/f/ddab9f31-0491-4445-8e6e-98370533a93d-1xdpq.png";
export const IMG_SECTOR_ATTACK =
  "https://utfs.io/f/d6587d1a-c11b-49e3-8e86-74bfb02a80a1-n9ug1k.png";
export const IMG_SECTOR_USER_MARKER =
  "https://utfs.io/f/cc347416-8bf6-40cf-9184-b4af64e6feae-n771t1.webp";
export const IMG_SECTOR_USER_SPRITE_MASK =
  "https://utfs.io/f/40061bc5-d73c-4265-8eff-4798fd840ae2-x83hc4.webp";
export const IMG_SECTOR_SHADOW =
  "https://utfs.io/f/bd8d8c75-96a0-4c71-94b6-f02e1ee382b5-exyuao.png";
export const IMG_SECTOR_USERSPRITE_LEFT =
  "https://utfs.io/f/5c812303-70aa-4fc4-982c-6e72eee3c4b6-u7oujn.webp";
export const IMG_SECTOR_USERSPRITE_RIGHT =
  "https://utfs.io/f/b6c5b6ba-99e0-49e5-b4a2-bf6ba9ca1ebc-dbaxa8.webp";
export const IMG_SECTOR_VS_ICON =
  "https://utfs.io/f/be789e50-095f-4e50-bffc-fe0fedd8777b-dd7l0q.webp";
export const IMG_SECTOR_WALL_STONE_TOWER =
  "https://utfs.io/f/aab037bb-7ac7-48f7-9994-548d87eb55f1-lga892.webp";
export const IMG_MAP_HEXASPHERE =
  "https://utfs.io/f/eb805d73-5216-4d5c-b3e9-c39cc2340922-ixejn7.json";

export const IMG_TRAIN_INTELLIGENCE =
  "https://utfs.io/f/815a53ea-23d2-4767-9219-a36ed3d4c619-d73vsv.png";
export const IMG_TRAIN_WILLPOWER =
  "https://utfs.io/f/a303f719-e216-4142-b1c2-50b2ac1d98c3-t57iq5.png";
export const IMG_TRAIN_STRENGTH =
  "https://utfs.io/f/70e251a8-17d2-4d5d-a121-55fb43bf5b37-tmi4ap.png";
export const IMG_TRAIN_SPEED =
  "https://utfs.io/f/893e0cc5-9b53-442c-af5d-9aacd95e6d8b-1ta05j.png";
export const IMG_TRAIN_GEN_OFF =
  "https://utfs.io/f/598a40f5-4cfa-4ad7-8378-eb63f0b28282-f9eh41.png";
export const IMG_TRAIN_GEN_DEF =
  "https://utfs.io/f/38463f2d-8c5b-4e4f-b74e-52667469a478-z4l40b.png";
export const IMG_TRAIN_TAI_DEF =
  "https://utfs.io/f/c6091de0-8c6f-4a17-8d75-067338f9fdf0-8ghs8v.png";
export const IMG_TRAIN_TAI_OFF =
  "https://utfs.io/f/6dcf3cfd-0084-49ec-8b5f-36dff3212d35-beounf.png";
export const IMG_TRAIN_BUKI_OFF =
  "https://utfs.io/f/b6daa0ab-698a-4e13-8e5f-c7560cfdc499-mcc2dc.png";
export const IMG_TRAIN_BUKI_DEF =
  "https://utfs.io/f/5faa1363-2ecc-4533-9077-b3c14afd58c6-stlcpi.png";
export const IMG_TRAIN_NIN_OFF =
  "https://utfs.io/f/4727d488-1eb0-475e-adfe-ca26837c45a1-g8pm8u.png";
export const IMG_TRAIN_NIN_DEF =
  "https://utfs.io/f/308d9bee-5105-4534-b11c-59592db90181-yx7su0.png";

export const IMG_ELEMENT_YINYANG =
  "https://utfs.io/f/Hzww9EQvYURJIlW2BrxfOewksxBoS1HQCihpL7c42Ky9uUFv";
export const IMG_ELEMENT_SHADOW =
  "https://utfs.io/f/Hzww9EQvYURJvSWrdXEmSnXwslYEpV1yOeNL8gMtqhjPdf36";
export const IMG_ELEMENT_NONE =
  "https://utfs.io/f/Hzww9EQvYURJeC2dFWVyV3OvUJQExAi0bGoIZDF74LqSnHRd";
export const IMG_ELEMENT_EXPLOSION =
  "https://utfs.io/f/Hzww9EQvYURJCH1oeV26OYrIJuNP1pvSyz29edFtKbngjRcA";
export const IMG_ELEMENT_WIND =
  "https://utfs.io/f/Hzww9EQvYURJ2HrMNjAnMXlcRpYmJ5do0zKw4Qx6PVEtBa9b";
export const IMG_ELEMENT_WATER =
  "https://utfs.io/f/Hzww9EQvYURJoYFqRUhZ9MPZpHJ7VliuEWDfATdxhv62SXnm";
export const IMG_ELEMENT_LAVA =
  "https://utfs.io/f/Hzww9EQvYURJaK2IZBYYfKMcJ2B5EmWt6VsNgqxpG8OSXAQk";
export const IMG_ELEMENT_ICE =
  "https://utfs.io/f/Hzww9EQvYURJCqHOvc26OYrIJuNP1pvSyz29edFtKbngjRcA";
export const IMG_ELEMENT_WOOD =
  "https://utfs.io/f/Hzww9EQvYURJbZYZaSPAtYUndMi56GkX19q0A4PzyeIloBrE";
export const IMG_ELEMENT_STORM =
  "https://utfs.io/f/Hzww9EQvYURJzu4spmSemvaQu94EYJs8HpxVzofny6iPtbgC";
export const IMG_ELEMENT_CRYSTAL =
  "https://utfs.io/f/Hzww9EQvYURJaKoVVmYYfKMcJ2B5EmWt6VsNgqxpG8OSXAQk";
export const IMG_ELEMENT_MAGNET =
  "https://utfs.io/f/Hzww9EQvYURJuNr6tnCyJLoOFkrcn4gxSwCfEQ9eMNXZlG8b";
export const IMG_ELEMENT_FIRE =
  "https://utfs.io/f/Hzww9EQvYURJAX1vCjoZUC4muiGcQNzjfEndY5y1w20B8hTW";
export const IMG_ELEMENT_LIGHT =
  "https://utfs.io/f/Hzww9EQvYURJeVtMZpyV3OvUJQExAi0bGoIZDF74LqSnHRdp";
export const IMG_ELEMENT_EARTH =
  "https://utfs.io/f/Hzww9EQvYURJgi7liFcU9cpECTimBdjaqbNn7vQsxGR1wLk4";
export const IMG_ELEMENT_SCORCH =
  "https://utfs.io/f/Hzww9EQvYURJCmW9wm326OYrIJuNP1pvSyz29edFtKbngjRc";
export const IMG_ELEMENT_DUST =
  "https://utfs.io/f/Hzww9EQvYURJchNmlmSnxBpQqGNDcTHbLmYz8uXAl3oa54ti";
export const IMG_ELEMENT_LIGHTNING =
  "https://utfs.io/f/Hzww9EQvYURJ4DIVIclYIif5CL8BKvMsOh2ZnmS7yHt0jTD3";

export const IMG_BASIC_HEAL =
  "https://utfs.io/f/Hzww9EQvYURJnlXNSKmojJ0EqeDCvBrNmZaXVdY97gSpOWiA";
export const IMG_BASIC_ATTACK =
  "https://utfs.io/f/Hzww9EQvYURJdMXlCrP62PI3ciLaYzgVX8FopBADxSrGmvQl";
export const IMG_BASIC_FLEE =
  "https://utfs.io/f/Hzww9EQvYURJRohRDR0udmODoNtpa0FMcwI4k2Eq7nJhyvjl";
export const IMG_BASIC_STEALTH =
  "https://utfs.io/f/Hzww9EQvYURJDtLSxhzEwoh0WXMnscL279N8ayVQUCbRzS3p";
export const IMG_BASIC_WAIT =
  "https://utfs.io/f/Hzww9EQvYURJ8ByNJwOkkp45TvAnoIBa0rtCf1lbyXYjVKQ2";
export const IMG_BASIC_MOVE =
  "https://utfs.io/f/Hzww9EQvYURJnQxuGeXmojJ0EqeDCvBrNmZaXVdY97gSpOWi";

export const IMG_ICON_DISCORD =
  "https://utfs.io/f/Hzww9EQvYURJCZvaND26OYrIJuNP1pvSyz29edFtKbngjRcA";
export const IMG_ICON_FACEBOOK =
  "https://utfs.io/f/Hzww9EQvYURJ1zjiDxX6bo95WClq4K0wxZUmJcvThgdVenO3";
export const IMG_ICON_GITHUB =
  "https://utfs.io/f/Hzww9EQvYURJydaEQfukVH2MI5Lo4ehEfAXvZdcmtWqPg7rp";
export const IMG_ICON_GOOGLE =
  "https://utfs.io/f/Hzww9EQvYURJCV0Mc426OYrIJuNP1pvSyz29edFtKbngjRcA";
export const IMG_ICON_INSTAGRAM =
  "https://utfs.io/f/Hzww9EQvYURJWLbTriPvszvj71yaSYC0MDOmbko5q9JAGuLH";
export const IMG_ICON_REDDIT =
  "https://utfs.io/f/Hzww9EQvYURJPYJEg8pKeUGyX2kj6u45AOQiSa1zYH0mqZoc";
export const IMG_ICON_TIKTOK =
  "https://utfs.io/f/Hzww9EQvYURJoYcyUDSZ9MPZpHJ7VliuEWDfATdxhv62SXnm";
export const IMG_ICON_TWITTER =
  "https://utfs.io/f/Hzww9EQvYURJMi2fCxtsO4cexqW2RDgkE3zZbNXSFGitmnar";
export const IMG_ICON_YOUTUBE =
  "https://utfs.io/f/Hzww9EQvYURJy7pL6jukVH2MI5Lo4ehEfAXvZdcmtWqPg7rp";
export const IMG_ICON_FORUM =
  "https://utfs.io/f/Hzww9EQvYURJTwT9cY5IU29dZYJPoOKSh5vmlqatMub3EigH";
export const IMG_ICON_MOVE =
  "https://utfs.io/f/Hzww9EQvYURJepKSYSyV3OvUJQExAi0bGoIZDF74LqSnHRdp";

export const IMG_MISSION_S =
  "https://utfs.io/f/Hzww9EQvYURJz3Ph17emvaQu94EYJs8HpxVzofny6iPtbgCZ";
export const IMG_MISSION_A =
  "https://utfs.io/f/Hzww9EQvYURJ0ORGP9grYldRWJcD6vE10SjNsXHeA9pVMfQi";
export const IMG_MISSION_B =
  "https://utfs.io/f/Hzww9EQvYURJoVn7VTZ9MPZpHJ7VliuEWDfATdxhv62SXnm4";
export const IMG_MISSION_C =
  "https://utfs.io/f/Hzww9EQvYURJoe3eJHZ9MPZpHJ7VliuEWDfATdxhv62SXnm4";
export const IMG_MISSION_D =
  "https://utfs.io/f/Hzww9EQvYURJ7r7fFcXKPBOUWGyFuM4DlL1v5HNTZhkte0z6";
export const IMG_MISSION_E =
  "https://utfs.io/f/Hzww9EQvYURJPAguocQpKeUGyX2kj6u45AOQiSa1zYH0mqZo";

export const IMG_BUILDING_MISSIONHALL =
  "https://utfs.io/f/Hzww9EQvYURJ2TCTWInMXlcRpYmJ5do0zKw4Qx6PVEtBa9b8";
export const IMG_BUILDING_SCIENCEBUILDING =
  "https://utfs.io/f/Hzww9EQvYURJwQxr3PT2j854CWbaITZyegfXimvd7s16cO0h";
export const IMG_BUILDING_NEWS =
  "https://utfs.io/f/Hzww9EQvYURJYKooj7OMAlNnPZ41ev6fCGcFK3hmjX9I8W7d";
export const IMG_BUILDING_SOUVENIER =
  "https://utfs.io/f/Hzww9EQvYURJHmrEYkQvYURJhgs76VZtf9wxpMa13Cq0iOnr";
export const IMG_BUILDING_HOSPITAL =
  "https://utfs.io/f/Hzww9EQvYURJ3n9SmD8pYHJX5rdkUTfOKtvu2eGIELmSWqBx";
export const IMG_BUILDING_GLOBALANBU =
  "https://utfs.io/f/Hzww9EQvYURJIfwMDCxfOewksxBoS1HQCihpL7c42Ky9uUFv";
export const IMG_BUILDING_BANK =
  "https://utfs.io/f/Hzww9EQvYURJEHFjuQLfKL5D7TAFe29bymSaPCIQ846MdzGg";
export const IMG_BUILDING_ARCHIVE =
  "https://utfs.io/f/Hzww9EQvYURJXk8AUJqIOpAoLKbZ4nW9Rsil2V67yuFwQhqv";
export const IMG_BUILDING_ADMINBUILDING =
  "https://utfs.io/f/Hzww9EQvYURJMyfWBKtsO4cexqW2RDgkE3zZbNXSFGitmnar";

export const IMG_ACTIONTIMER_BG =
  "https://utfs.io/f/Hzww9EQvYURJZNkUoDaYQrBIUTu69nkMxWmS4ah0O7LVCp8b";
export const IMG_ACTIONTIMER_YELLOW =
  "https://utfs.io/f/Hzww9EQvYURJXnRHYeqIOpAoLKbZ4nW9Rsil2V67yuFwQhqv";
export const IMG_ACTIONTIMER_RED =
  "https://utfs.io/f/Hzww9EQvYURJyrbex4ukVH2MI5Lo4ehEfAXvZdcmtWqPg7rp";
export const IMG_ACTIONTIMER_BLUE =
  "https://utfs.io/f/Hzww9EQvYURJqA6PRRdkOZgJQ8mGRcdx3SsWvPelyYFTt5Vn";
export const IMG_ACTIONTIMER_GREEN =
  "https://utfs.io/f/Hzww9EQvYURJwSFJxPT2j854CWbaITZyegfXimvd7s16cO0h";
export const IMG_ACTIONTIMER_OVERLAY =
  "https://utfs.io/f/Hzww9EQvYURJHVKSE4QvYURJhgs76VZtf9wxpMa13Cq0iOnr";
