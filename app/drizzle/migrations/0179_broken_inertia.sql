CREATE TABLE `UserVotes` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`siteId` varchar(191) NOT NULL,
	`lastVoteAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`votes` int NOT NULL DEFAULT 0,
	`lastRawJson` json NOT NULL,
	CONSTRAINT `UserVotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `UserVotes_userId_siteId_key` UNIQUE(`userId`,`siteId`)
);

CREATE INDEX `UserVotes_userId_idx` ON `UserVotes` (`userId`);