CREATE TABLE `UserVote` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`topWebGames` boolean NOT NULL DEFAULT false,
	`top100Arena` boolean NOT NULL DEFAULT false,
	`mmoHub` boolean NOT NULL DEFAULT false,
	`arenaTop100` boolean NOT NULL DEFAULT false,
	`xtremeTop100` boolean NOT NULL DEFAULT false,
	`topOnlineMmorpg` boolean NOT NULL DEFAULT false,
	`gamesTop200` boolean NOT NULL DEFAULT false,
	`browserMmorpg` boolean NOT NULL DEFAULT false,
	`apexWebGaming` boolean NOT NULL DEFAULT false,
	`mmorpg100` boolean NOT NULL DEFAULT false,
	`secret` varchar(191) NOT NULL,
	`lastVoteAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserVote_id` PRIMARY KEY(`id`),
	CONSTRAINT `UserVote_userId_idx` UNIQUE(`userId`)
);

DROP TABLE `UserVotes`;