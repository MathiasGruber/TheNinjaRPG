CREATE TABLE `JutsuLoadout` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`content` json NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `JutsuLoadout_id` PRIMARY KEY(`id`)
);

ALTER TABLE `UserData` ADD `jutsuLoadout` varchar(191);
CREATE INDEX `JutsuLoadout_userId_idx` ON `JutsuLoadout` (`userId`);