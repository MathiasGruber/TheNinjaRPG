UPDATE `UserRequest` SET `status` = 'CANCELLED' WHERE `type` = 'KAGE' AND `status` = 'PENDING';
UPDATE `UserData` SET `status` = 'AWAKE' WHERE `status` = 'KAGE_QUEUED';
CREATE TABLE `KageChallenge` (
	`id` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`challengerId` varchar(191) NOT NULL,
	`kageId` varchar(191) NOT NULL,
	`tenure` datetime(3) NOT NULL,
	`status` enum('QUEUED','SCHEDULED','STARTING','BATTLE','COMPLETED','CANCELLED','FORFEITED') NOT NULL DEFAULT 'QUEUED',
	`activeChallengerId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `status` IN ('QUEUED','SCHEDULED','STARTING','BATTLE') THEN `challengerId` ELSE NULL END) STORED,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`scheduledAt` datetime(3),
	`notBefore` datetime(3) NOT NULL,
	`checkedInAt` datetime(3),
	`rescheduled` boolean NOT NULL DEFAULT false,
	`hospitalDeferred` boolean NOT NULL DEFAULT false,
	`aiRequested` boolean NOT NULL DEFAULT false,
	`aiAccepted` boolean NOT NULL DEFAULT false,
	`battleId` varchar(191),
	`startedAt` datetime(3),
	`resolvedAt` datetime(3),
	`outcome` varchar(512),
	CONSTRAINT `KageChallenge_id` PRIMARY KEY(`id`),
	CONSTRAINT `KageChallenge_activeChallenger_key` UNIQUE(`activeChallengerId`),
	CONSTRAINT `KageChallenge_battleId_key` UNIQUE(`battleId`)
);

ALTER TABLE `UserData` MODIFY COLUMN `status` enum('AWAKE','HOSPITALIZED','TRAVEL','BATTLE','QUEUED','ASLEEP') NOT NULL DEFAULT 'AWAKE';
ALTER TABLE `Village` ADD `kageSchedule` json;
ALTER TABLE `Village` ADD `kageScheduleVersion` int DEFAULT 0 NOT NULL;
ALTER TABLE `Village` ADD `kageScheduleAvailableAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `VillageElderVote` ADD `reason` varchar(1000) DEFAULT '' NOT NULL;
ALTER TABLE `VillageElderVote` ADD `tenure` datetime(3);
ALTER TABLE `VillageElderVote` ADD `resolvedAt` datetime(3);
ALTER TABLE `VillageElderVote` ADD `successorId` varchar(191);
CREATE INDEX `KageChallenge_village_status_created_idx` ON `KageChallenge` (`villageId`,`status`,`createdAt`);
CREATE INDEX `KageChallenge_challenger_started_idx` ON `KageChallenge` (`challengerId`,`startedAt`);
ALTER TABLE `Village` DROP COLUMN `openForChallenges`;
ALTER TABLE `Village` DROP COLUMN `openForChallengesAt`;