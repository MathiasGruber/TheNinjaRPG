CREATE TABLE `UserBlackList` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorUserId` varchar(191) NOT NULL,
	`targetUserId` varchar(191) NOT NULL,
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserBlackList_id` PRIMARY KEY(`id`)
);

CREATE INDEX `BlackList_creatorUserId_idx` ON `UserBlackList` (`creatorUserId`);
CREATE INDEX `BlackList_targetUserId_idx` ON `UserBlackList` (`targetUserId`);