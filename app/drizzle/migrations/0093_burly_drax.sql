CREATE TABLE `Tournament` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`round` tinyint NOT NULL DEFAULT 1,
	`type` enum('CLAN') NOT NULL,
	`rewards` json NOT NULL,
	`startedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL 1 DAY ),
	`roundStartedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL 1 DAY ),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`status` enum('OPEN','IN_PROGRESS','COMPLETED') NOT NULL DEFAULT 'OPEN',
	CONSTRAINT `Tournament_id` PRIMARY KEY(`id`),
	CONSTRAINT `Tournament_name_key` UNIQUE(`name`)
) ENGINE InnoDB, CHARACTER SET utf8mb4, COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TournamentMatch` (
	`id` varchar(191) NOT NULL,
	`tournamentId` varchar(191) NOT NULL,
	`round` int NOT NULL,
	`match` int NOT NULL,
	`state` enum('WAITING','PLAYED','NO_SHOW') NOT NULL DEFAULT 'WAITING',
	`winnerId` varchar(191),
	`battleId` varchar(191),
	`userId1` varchar(191) NOT NULL,
	`userId2` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`startedAt` datetime(3) NOT NULL,
	CONSTRAINT `TournamentMatch_id` PRIMARY KEY(`id`)
) ENGINE InnoDB, CHARACTER SET utf8mb4, COLLATE utf8mb4_unicode_ci;

CREATE TABLE `TournamentRecord` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`round` tinyint NOT NULL DEFAULT 1,
	`type` enum('CLAN') NOT NULL,
	`rewards` json NOT NULL,
	`startedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL 1 DAY ),
	`winnerId` varchar(191),
	CONSTRAINT `TournamentRecord_id` PRIMARY KEY(`id`),
	CONSTRAINT `HistoricalTournament_name_key` UNIQUE(`name`)
) ENGINE InnoDB, CHARACTER SET utf8mb4, COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Battle` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','CLAN_BATTLE','TOURNAMENT','QUEST') NOT NULL;
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_CHALLENGE','CLAN_CHALLENGE','CLAN_BATTLE','TOURNAMENT','QUEST') NOT NULL;
CREATE INDEX `TournamentMatch_tournamentId_idx` ON `TournamentMatch` (`tournamentId`);
CREATE INDEX `TournamentMatch_userId1_idx` ON `TournamentMatch` (`userId1`);
CREATE INDEX `TournamentMatch_userId2_idx` ON `TournamentMatch` (`userId2`);
CREATE INDEX `TournamentMatch_winnerId_idx` ON `TournamentMatch` (`winnerId`);