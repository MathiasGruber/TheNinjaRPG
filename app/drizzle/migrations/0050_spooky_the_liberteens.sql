CREATE TABLE `UserChallenge` (
	`id` varchar(191) NOT NULL,
	`challengerId` varchar(191) NOT NULL,
	`challengedId` varchar(191) NOT NULL,
	`status` enum('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED') NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserChallenge_id` PRIMARY KEY(`id`)
);

CREATE INDEX `UserChallenge_createdAt_idx` ON `UserChallenge` (`createdAt`);
CREATE INDEX `UserChallenge_challengerId_idx` ON `UserChallenge` (`challengerId`);
CREATE INDEX `UserChallenge_challengedId_idx` ON `UserChallenge` (`challengedId`);