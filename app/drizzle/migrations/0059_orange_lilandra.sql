CREATE TABLE `KageDefendedChallenges` (
	`id` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`kageId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`rounds` int NOT NULL,
	CONSTRAINT `KageDefendedChallenges_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Battle` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE') NOT NULL;
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE') NOT NULL;
ALTER TABLE `UserData` MODIFY COLUMN `unreadNotifications` smallint NOT NULL;
ALTER TABLE `Village` MODIFY COLUMN `kageId` varchar(191) NOT NULL;
CREATE INDEX `VillageKageChallenges_villageId_idx` ON `KageDefendedChallenges` (`villageId`);
CREATE INDEX `VillageKageChallenges_userId_idx` ON `KageDefendedChallenges` (`userId`);
CREATE INDEX `VillageKageChallenges_kageID_idx` ON `KageDefendedChallenges` (`kageId`);