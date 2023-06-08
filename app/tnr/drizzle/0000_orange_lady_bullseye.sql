-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE `Battle` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`background` varchar(191) NOT NULL,
	`battleType` enum('ARENA','COMBAT','SPARRING') NOT NULL,
	`usersState` json NOT NULL,
	`usersEffects` json NOT NULL,
	`groundEffects` json NOT NULL,
	`version` int NOT NULL DEFAULT 1);

CREATE TABLE `BattleAction` (
	`id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`battleId` varchar(191) NOT NULL,
	`battleVersion` int NOT NULL,
	`description` text NOT NULL,
	`appliedEffects` json NOT NULL);

CREATE TABLE `Bloodline` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`effects` json NOT NULL,
	`description` text NOT NULL,
	`regenIncrease` int NOT NULL DEFAULT 0,
	`village` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`rank` enum('D','C','B','A','S') NOT NULL);

CREATE TABLE `BloodlineRolls` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`bloodlineId` varchar(191),
	`used` tinyint NOT NULL DEFAULT 0);

CREATE TABLE `BugReport` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`title` varchar(191) NOT NULL,
	`content` text NOT NULL,
	`summary` varchar(191) NOT NULL DEFAULT 'No summary provided',
	`system` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`userId` varchar(191) NOT NULL,
	`is_resolved` tinyint NOT NULL DEFAULT 0,
	`popularity` int NOT NULL DEFAULT 0,
	`conversationId` varchar(191) NOT NULL);

CREATE TABLE `BugVotes` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`value` tinyint NOT NULL,
	`bugId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL);

CREATE TABLE `Conversation` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`title` varchar(191),
	`createdById` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`isLocked` tinyint NOT NULL DEFAULT 0,
	`isPublic` tinyint NOT NULL DEFAULT 1);

CREATE TABLE `ConversationComment` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`userId` varchar(191) NOT NULL,
	`conversationId` varchar(191),
	`isPinned` tinyint NOT NULL DEFAULT 0);

CREATE TABLE `ForumBoard` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`summary` text NOT NULL,
	`group` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`nPosts` int NOT NULL DEFAULT 0,
	`nThreads` int NOT NULL DEFAULT 0);

CREATE TABLE `ForumPost` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`userId` varchar(191) NOT NULL,
	`threadId` varchar(191) NOT NULL);

CREATE TABLE `ForumThread` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`title` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`boardId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`nPosts` int NOT NULL DEFAULT 0,
	`isPinned` tinyint NOT NULL DEFAULT 0,
	`isLocked` tinyint NOT NULL DEFAULT 0);

CREATE TABLE `HistoricalAvatar` (
	`id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`avatar` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`userId` varchar(191) NOT NULL,
	`replicateId` varchar(191),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`status` varchar(191) NOT NULL DEFAULT 'started',
	`done` tinyint NOT NULL DEFAULT 0);

CREATE TABLE `Item` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`effects` json NOT NULL,
	`itemType` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','EVENT','OTHER') NOT NULL,
	`rarity` enum('COMMON','RARE','EPIC','LEGENDARY') NOT NULL,
	`slot` enum('HEAD','CHEST','LEGS','FEET','HAND','ITEM') NOT NULL,
	`cost` int NOT NULL DEFAULT 1,
	`weaponType` enum('STAFF','AXE','FIST_WEAPON','SHURIKEN','SICKLE','DAGGER','SWORD','POLEARM','FLAIL','CHAIN','FAN','BOW','HAMMER'),
	`canStack` tinyint NOT NULL DEFAULT 0,
	`stackSize` int NOT NULL DEFAULT 1,
	`target` enum('SELF','OTHER_USER','OPPONENT','ALLY','CHARACTER','GROUND','EMPTY_GROUND') NOT NULL,
	`chakraCostPerc` double NOT NULL DEFAULT 0,
	`image` varchar(191) NOT NULL,
	`staminaCostPerc` double NOT NULL DEFAULT 0,
	`destroyOnUse` tinyint NOT NULL DEFAULT 0,
	`range` int NOT NULL DEFAULT 0,
	`method` enum('SINGLE','ALL','AOE_CIRCLE_SPAWN','AOE_LINE_SHOOT','AOE_CIRCLE_SHOOT','AOE_SPIRAL_SHOOT') NOT NULL DEFAULT 'SINGLE',
	`actionCostPerc` double NOT NULL DEFAULT 60,
	`healthCostPerc` double NOT NULL DEFAULT 0,
	`battleDescription` text NOT NULL DEFAULT (''));

CREATE TABLE `Jutsu` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`effects` json NOT NULL,
	`target` enum('SELF','OTHER_USER','OPPONENT','ALLY','CHARACTER','GROUND','EMPTY_GROUND') NOT NULL,
	`range` int NOT NULL,
	`cooldown` int NOT NULL DEFAULT 0,
	`bloodlineId` varchar(191),
	`requiredRank` enum('STUDENT','GENIN','CHUNIN','JONIN','COMMANDER','ELDER','NONE') NOT NULL,
	`jutsuType` enum('NORMAL','SPECIAL','BLOODLINE','FORBIDDEN','LOYALTY','CLAN','EVENT','AI') NOT NULL,
	`image` varchar(191) NOT NULL,
	`jutsuWeapon` enum('STAFF','AXE','FIST_WEAPON','SHURIKEN','SICKLE','DAGGER','SWORD','POLEARM','FLAIL','CHAIN','FAN','BOW','HAMMER'),
	`battleDescription` text NOT NULL,
	`chakraCostPerc` double NOT NULL DEFAULT 0.05,
	`healthCostPerc` double NOT NULL DEFAULT 0,
	`jutsuRank` enum('D','C','B','A','S') NOT NULL DEFAULT 'D',
	`staminaCostPerc` double NOT NULL DEFAULT 0,
	`villageId` varchar(191),
	`method` enum('SINGLE','ALL','AOE_CIRCLE_SPAWN','AOE_LINE_SHOOT','AOE_CIRCLE_SHOOT','AOE_SPIRAL_SHOOT') NOT NULL DEFAULT 'SINGLE',
	`actionCostPerc` double NOT NULL DEFAULT 80);

CREATE TABLE `PaypalSubscription` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdById` varchar(191) NOT NULL,
	`affectedUserId` varchar(191) NOT NULL,
	`status` varchar(191) NOT NULL,
	`federalStatus` enum('NONE','NORMAL','SILVER','GOLD') NOT NULL,
	`orderId` varchar(191),
	`subscriptionId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL);

CREATE TABLE `PaypalTransaction` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdById` varchar(191) NOT NULL,
	`affectedUserId` varchar(191) NOT NULL,
	`transactionId` varchar(191) NOT NULL,
	`transactionUpdatedDate` varchar(191) NOT NULL,
	`orderId` varchar(191),
	`invoiceId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`amount` double NOT NULL DEFAULT 0,
	`reputationPoints` int NOT NULL DEFAULT 0,
	`currency` varchar(191) NOT NULL DEFAULT 'USD',
	`status` varchar(191) NOT NULL,
	`rawData` json NOT NULL);

CREATE TABLE `PaypalWebhookMessage` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`eventType` varchar(191) NOT NULL,
	`rawData` json NOT NULL,
	`handled` tinyint NOT NULL DEFAULT 0);

CREATE TABLE `ReportLog` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`targetUserId` varchar(191),
	`staffUserId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`action` varchar(191) NOT NULL);

CREATE TABLE `UserAttribute` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`attribute` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL);

CREATE TABLE `UserData` (
	`userId` varchar(191) PRIMARY KEY NOT NULL,
	`username` varchar(191) NOT NULL,
	`gender` varchar(191) NOT NULL,
	`cur_health` int NOT NULL DEFAULT 100,
	`max_health` int NOT NULL DEFAULT 100,
	`cur_chakra` int NOT NULL DEFAULT 100,
	`max_chakra` int NOT NULL DEFAULT 100,
	`cur_stamina` int NOT NULL DEFAULT 100,
	`max_stamina` int NOT NULL DEFAULT 100,
	`regeneration` int NOT NULL DEFAULT 1,
	`money` int NOT NULL DEFAULT 100,
	`bank` int NOT NULL DEFAULT 100,
	`experience` int NOT NULL DEFAULT 0,
	`rank` enum('STUDENT','GENIN','CHUNIN','JONIN','COMMANDER','ELDER','NONE') NOT NULL DEFAULT 'STUDENT',
	`level` int NOT NULL DEFAULT 1,
	`villageId` varchar(191),
	`bloodlineId` varchar(191),
	`status` enum('AWAKE','HOSPITALIZED','TRAVEL','BATTLE') NOT NULL DEFAULT 'AWAKE',
	`strength` double NOT NULL DEFAULT 10,
	`intelligence` double NOT NULL DEFAULT 10,
	`willpower` double NOT NULL DEFAULT 10,
	`speed` double NOT NULL DEFAULT 10,
	`ninjutsu_offence` double NOT NULL DEFAULT 10,
	`ninjutsu_defence` double NOT NULL DEFAULT 10,
	`genjutsu_offence` double NOT NULL DEFAULT 10,
	`genjutsu_defence` double NOT NULL DEFAULT 10,
	`taijutsu_offence` double NOT NULL DEFAULT 10,
	`taijutsu_defence` double NOT NULL DEFAULT 10,
	`reputation_points` int NOT NULL DEFAULT 0,
	`reputation_points_total` int NOT NULL DEFAULT 0,
	`popularity_points` int NOT NULL DEFAULT 6,
	`popularity_points_total` int NOT NULL DEFAULT 6,
	`federalStatus` enum('NONE','NORMAL','SILVER','GOLD') NOT NULL DEFAULT 'NONE',
	`approved_tos` tinyint NOT NULL DEFAULT 0,
	`avatar` varchar(191),
	`sector` int NOT NULL DEFAULT 0,
	`longitude` int NOT NULL DEFAULT 10,
	`latitude` int NOT NULL DEFAULT 7,
	`location` varchar(191) NOT NULL DEFAULT '',
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`deletionAt` datetime(3),
	`travelFinishAt` datetime(3),
	`isBanned` tinyint NOT NULL DEFAULT 0,
	`role` enum('USER','MODERATOR','ADMIN') NOT NULL DEFAULT 'USER',
	`battleId` varchar(191),
	`isAI` tinyint NOT NULL DEFAULT 0,
	`bukijutsu_defence` double NOT NULL DEFAULT 10,
	`bukijutsu_offence` double NOT NULL DEFAULT 10,
	`elo_pve` int NOT NULL DEFAULT 1,
	`elo_pvp` int NOT NULL DEFAULT 1,
	`regenAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)));

CREATE TABLE `UserItem` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`itemId` varchar(191) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`equipped` enum('HEAD','CHEST','LEGS','FEET','HAND_1','HAND_2','ITEM_1','ITEM_2','ITEM_3','ITEM_4','ITEM_5','ITEM_6','ITEM_7'));

CREATE TABLE `UserJutsu` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`userId` varchar(191) NOT NULL,
	`jutsuId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`equipped` tinyint NOT NULL DEFAULT 0,
	`finishTraining` datetime(3));

CREATE TABLE `UserReport` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`reporterUserId` varchar(191),
	`reportedUserId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`system` varchar(191) NOT NULL,
	`infraction` json NOT NULL,
	`reason` varchar(191) NOT NULL,
	`banEnd` datetime(3),
	`adminResolved` tinyint NOT NULL DEFAULT 0,
	`status` enum('UNVIEWED','REPORT_CLEARED','BAN_ACTIVATED','BAN_ESCALATED') NOT NULL DEFAULT 'UNVIEWED');

CREATE TABLE `UserReportComment` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`content` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`userId` varchar(191) NOT NULL,
	`reportId` varchar(191) NOT NULL,
	`decision` enum('UNVIEWED','REPORT_CLEARED','BAN_ACTIVATED','BAN_ESCALATED'));

CREATE TABLE `UsersInConversation` (
	`conversationId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`assignedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	PRIMARY KEY(`conversationId`,`userId`)
);

CREATE TABLE `Village` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`sector` int NOT NULL DEFAULT 1,
	`hexColor` varchar(191) NOT NULL DEFAULT '#000000');

CREATE TABLE `VillageStructure` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`name` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`level` int NOT NULL DEFAULT 1,
	`max_level` int NOT NULL DEFAULT 10,
	`cur_sp` int NOT NULL DEFAULT 100,
	`max_sp` int NOT NULL DEFAULT 100);

CREATE TABLE `_prisma_migrations` (
	`id` varchar(36) PRIMARY KEY NOT NULL,
	`checksum` varchar(64) NOT NULL,
	`finished_at` datetime(3),
	`migration_name` varchar(255) NOT NULL,
	`logs` text,
	`rolled_back_at` datetime(3),
	`started_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`applied_steps_count` int unsigned NOT NULL DEFAULT 0);

CREATE UNIQUE INDEX `Battle_id_version_key` ON `Battle` (`id`,`version`);
CREATE INDEX `BattleAction_battleId_idx` ON `BattleAction` (`battleId`);
CREATE UNIQUE INDEX `Bloodline_name_key` ON `Bloodline` (`name`);
CREATE UNIQUE INDEX `Bloodline_image_key` ON `Bloodline` (`image`);
CREATE INDEX `Bloodline_village_idx` ON `Bloodline` (`village`);
CREATE INDEX `Bloodline_rank_idx` ON `Bloodline` (`rank`);
CREATE UNIQUE INDEX `BloodlineRolls_userId_key` ON `BloodlineRolls` (`userId`);
CREATE INDEX `BloodlineRolls_bloodlineId_idx` ON `BloodlineRolls` (`bloodlineId`);
CREATE INDEX `BloodlineRolls_userId_idx` ON `BloodlineRolls` (`userId`);
CREATE UNIQUE INDEX `BugReport_conversationId_key` ON `BugReport` (`conversationId`);
CREATE INDEX `BugReport_userId_idx` ON `BugReport` (`userId`);
CREATE UNIQUE INDEX `BugVotes_bugId_userId_key` ON `BugVotes` (`bugId`,`userId`);
CREATE INDEX `BugVotes_userId_idx` ON `BugVotes` (`userId`);
CREATE UNIQUE INDEX `Conversation_title_key` ON `Conversation` (`title`);
CREATE INDEX `Conversation_createdById_idx` ON `Conversation` (`createdById`);
CREATE INDEX `ConversationComment_userId_idx` ON `ConversationComment` (`userId`);
CREATE INDEX `ConversationComment_conversationId_idx` ON `ConversationComment` (`conversationId`);
CREATE UNIQUE INDEX `ForumBoard_name_key` ON `ForumBoard` (`name`);
CREATE INDEX `ForumPost_userId_idx` ON `ForumPost` (`userId`);
CREATE INDEX `ForumPost_threadId_idx` ON `ForumPost` (`threadId`);
CREATE INDEX `ForumThread_boardId_idx` ON `ForumThread` (`boardId`);
CREATE INDEX `ForumThread_userId_idx` ON `ForumThread` (`userId`);
CREATE UNIQUE INDEX `HistoricalAvatar_replicateId_key` ON `HistoricalAvatar` (`replicateId`);
CREATE UNIQUE INDEX `HistoricalAvatar_avatar_key` ON `HistoricalAvatar` (`avatar`);
CREATE INDEX `HistoricalAvatar_userId_idx` ON `HistoricalAvatar` (`userId`);
CREATE INDEX `HistoricalAvatar_replicateId_idx` ON `HistoricalAvatar` (`replicateId`);
CREATE INDEX `HistoricalAvatar_avatar_idx` ON `HistoricalAvatar` (`avatar`);
CREATE UNIQUE INDEX `Item_name_key` ON `Item` (`name`);
CREATE UNIQUE INDEX `Item_image_key` ON `Item` (`image`);
CREATE UNIQUE INDEX `Jutsu_name_key` ON `Jutsu` (`name`);
CREATE UNIQUE INDEX `Jutsu_image_key` ON `Jutsu` (`image`);
CREATE INDEX `Jutsu_bloodlineId_idx` ON `Jutsu` (`bloodlineId`);
CREATE INDEX `Jutsu_villageId_idx` ON `Jutsu` (`villageId`);
CREATE UNIQUE INDEX `PaypalSubscription_subscriptionId_key` ON `PaypalSubscription` (`subscriptionId`);
CREATE UNIQUE INDEX `PaypalSubscription_orderId_key` ON `PaypalSubscription` (`orderId`);
CREATE INDEX `PaypalSubscription_createdById_idx` ON `PaypalSubscription` (`createdById`);
CREATE INDEX `PaypalSubscription_affectedUserId_idx` ON `PaypalSubscription` (`affectedUserId`);
CREATE UNIQUE INDEX `PaypalTransaction_orderId_key` ON `PaypalTransaction` (`orderId`);
CREATE INDEX `PaypalTransaction_createdById_idx` ON `PaypalTransaction` (`createdById`);
CREATE INDEX `PaypalTransaction_affectedUserId_idx` ON `PaypalTransaction` (`affectedUserId`);
CREATE INDEX `ReportLog_targetUserId_idx` ON `ReportLog` (`targetUserId`);
CREATE INDEX `ReportLog_staffUserId_idx` ON `ReportLog` (`staffUserId`);
CREATE UNIQUE INDEX `UserAttribute_attribute_userId_key` ON `UserAttribute` (`attribute`,`userId`);
CREATE INDEX `UserAttribute_userId_idx` ON `UserAttribute` (`userId`);
CREATE UNIQUE INDEX `UserData_userId_key` ON `UserData` (`userId`);
CREATE UNIQUE INDEX `UserData_username_key` ON `UserData` (`username`);
CREATE INDEX `UserData_bloodlineId_idx` ON `UserData` (`bloodlineId`);
CREATE INDEX `UserData_villageId_idx` ON `UserData` (`villageId`);
CREATE INDEX `UserData_battleId_idx` ON `UserData` (`battleId`);
CREATE INDEX `UserData_userId_idx` ON `UserData` (`userId`);
CREATE INDEX `UserItem_userId_idx` ON `UserItem` (`userId`);
CREATE INDEX `UserItem_itemId_idx` ON `UserItem` (`itemId`);
CREATE UNIQUE INDEX `UserJutsu_userId_jutsuId_key` ON `UserJutsu` (`userId`,`jutsuId`);
CREATE INDEX `UserJutsu_userId_idx` ON `UserJutsu` (`userId`);
CREATE INDEX `UserJutsu_jutsuId_idx` ON `UserJutsu` (`jutsuId`);
CREATE INDEX `UserReport_reporterUserId_idx` ON `UserReport` (`reporterUserId`);
CREATE INDEX `UserReport_reportedUserId_idx` ON `UserReport` (`reportedUserId`);
CREATE INDEX `UserReportComment_userId_idx` ON `UserReportComment` (`userId`);
CREATE INDEX `UserReportComment_reportId_idx` ON `UserReportComment` (`reportId`);
CREATE INDEX `UsersInConversation_userId_idx` ON `UsersInConversation` (`userId`);
CREATE INDEX `UsersInConversation_conversationId_idx` ON `UsersInConversation` (`conversationId`);
CREATE UNIQUE INDEX `Village_name_key` ON `Village` (`name`);
CREATE UNIQUE INDEX `Village_sector_key` ON `Village` (`sector`);
CREATE UNIQUE INDEX `VillageStructure_name_villageId_key` ON `VillageStructure` (`name`,`villageId`);
CREATE INDEX `VillageStructure_villageId_idx` ON `VillageStructure` (`villageId`);
*/