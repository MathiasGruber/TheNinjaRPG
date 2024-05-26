CREATE TABLE `MpvpBattleQueue` (
	`id` varchar(191) NOT NULL,
	`clan1Id` varchar(191) NOT NULL,
	`clan2Id` varchar(191) NOT NULL,
	`winnerId` varchar(191),
	`battleId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `MpvpBattleQueue_id` PRIMARY KEY(`id`)
);

CREATE TABLE `MpvpBattleUser` (
	`id` varchar(191) NOT NULL,
	`clanBattleId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `MpvpBattleUser_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Battle` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','CLAN_BATTLE','QUEST') NOT NULL;
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','CLAN_BATTLE','QUEST') NOT NULL;
ALTER TABLE `UserData` MODIFY COLUMN `status` enum('AWAKE','HOSPITALIZED','TRAVEL','BATTLE','QUEUED','ASLEEP') NOT NULL DEFAULT 'AWAKE';
CREATE INDEX `MpvpBattleQueue_battleId_idx` ON `MpvpBattleQueue` (`battleId`);
CREATE INDEX `MpvpBattleQueue_clan1Id_idx` ON `MpvpBattleQueue` (`clan1Id`);
CREATE INDEX `MpvpBattleQueue_clan2Id_idx` ON `MpvpBattleQueue` (`clan2Id`);
CREATE INDEX `MpvpBattleQueue_winnerId_idx` ON `MpvpBattleQueue` (`winnerId`);
CREATE INDEX `MpvpBattleUser_clanBattleId_idx` ON `MpvpBattleUser` (`clanBattleId`);
CREATE INDEX `MpvpBattleUser_userId_idx` ON `MpvpBattleUser` (`userId`);