export const LetterRanks = ["D", "C", "B", "A", "S"] as const;
export type LetterRank = (typeof LetterRanks)[number];

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

export const BattleTypes = ["ARENA", "COMBAT", "SPARRING"] as const;

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

export const ChallengeStates = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type ChallengeState = (typeof ChallengeStates)[number];

export const AllianceStates = ["NEUTRAL", "ALLY", "ENEMY"] as const;
export type AllianceState = (typeof AllianceStates)[number];
