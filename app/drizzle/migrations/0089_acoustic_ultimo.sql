CREATE TABLE `Clan` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`founderId` varchar(191) NOT NULL,
	`leaderId` varchar(191) NOT NULL,
	`coLeader1` varchar(191),
	`coLeader2` varchar(191),
	`coLeader3` varchar(191),
	`coLeader4` varchar(191),
	`leaderOrderId` varchar(191) NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`bank` int NOT NULL DEFAULT 0,
	`pvpActivity` int NOT NULL DEFAULT 0,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `Clan_id` PRIMARY KEY(`id`),
	CONSTRAINT `Clan_name_key` UNIQUE(`name`)
);

ALTER TABLE `Battle` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','QUEST') NOT NULL;
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','QUEST') NOT NULL;
ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU','CLAN') NOT NULL;
ALTER TABLE `UserData` ADD `clanId` varchar(191);
CREATE INDEX `Clan_village_idx` ON `Clan` (`villageId`);

UPDATE `VillageStructure` SET `level` = 1 WHERE `route` = '/clanhall'; 