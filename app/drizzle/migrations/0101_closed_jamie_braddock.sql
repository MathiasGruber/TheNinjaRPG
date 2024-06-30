CREATE TABLE `GameSetting` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`time` datetime(3) NOT NULL,
	`value` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `GameSetting_id` PRIMARY KEY(`id`)
);

DROP TABLE `GameTimers`;
CREATE INDEX `name` ON `GameSetting` (`name`);