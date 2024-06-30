CREATE TABLE `GameSetting` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`time` datetime(3) NOT NULL,
	`value` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `GameSetting_id` PRIMARY KEY(`id`)
);

DROP TABLE `GameSettings`;
CREATE INDEX `name` ON `GameSetting` (`name`);

ALTER TABLE `UserData` MODIFY COLUMN `regeneration` tinyint NOT NULL DEFAULT 60;
UPDATE `UserData` SET `regeneration` = 60 WHERE `regeneration` = 1;