CREATE TABLE `GameTimers` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`time` datetime(3) NOT NULL,
	CONSTRAINT `GameTimers_id` PRIMARY KEY(`id`)
);

CREATE TABLE `Quest` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`image` varchar(191),
	`description` varchar(512),
	`successDescription` varchar(512),
	`requiredRank` enum('D','C','B','A','S') NOT NULL DEFAULT 'D',
	`requiredLevel` int NOT NULL DEFAULT 1,
	`tierLevel` int,
	`timeFrame` enum('daily','weekly','monthly','all_time') NOT NULL,
	`questType` enum('mission','crime','event','exam','errand','tier','daily') NOT NULL,
	`content` json NOT NULL,
	`hidden` tinyint NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`expiresAt` date,
	CONSTRAINT `Quest_id` PRIMARY KEY(`id`),
	CONSTRAINT `tierLevel` UNIQUE(`tierLevel`),
	CONSTRAINT `Quest_id` UNIQUE(`id`)
);

CREATE TABLE `QuestHistory` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`questId` varchar(191) NOT NULL,
	`questType` enum('mission','crime','event','exam','errand','tier','daily') NOT NULL,
	`startedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`endedAt` datetime(3),
	`completed` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `QuestHistory_id` PRIMARY KEY(`id`)
);

ALTER TABLE `UserData` ADD `joinedVillageAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `UserData` ADD `questData` json;
CREATE INDEX `name` ON `GameTimers` (`name`);