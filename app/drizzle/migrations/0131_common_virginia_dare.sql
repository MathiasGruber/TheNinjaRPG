CREATE TABLE `GameRule` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` varchar(500) NOT NULL,
	`value` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `GameRule_id` PRIMARY KEY(`id`)
);

ALTER TABLE `BattleHistory` ADD `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','CLAN_BATTLE','TOURNAMENT','QUEST');
CREATE INDEX `name` ON `GameRule` (`name`);