CREATE TABLE `TournamentRewardClaim` (
	`id` varchar(191) NOT NULL,
	`tournamentId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `TournamentRewardClaim_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Tournament` MODIFY COLUMN `type` enum('CLAN','EVENT') NOT NULL;
ALTER TABLE `TournamentRecord` MODIFY COLUMN `type` enum('CLAN','EVENT') NOT NULL;
ALTER TABLE `Tournament` ADD `eventData` json;
ALTER TABLE `Tournament` ADD `version` int DEFAULT 0 NOT NULL;
CREATE INDEX `TournamentRewardClaim_tournamentId_idx` ON `TournamentRewardClaim` (`tournamentId`);