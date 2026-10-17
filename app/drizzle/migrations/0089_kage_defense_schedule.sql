-- Release activity-locking challenges before removing their UserData status.
UPDATE `UserRequest` SET `status` = 'CANCELLED' WHERE `type` = 'KAGE' AND `status` = 'PENDING';
UPDATE `UserData` SET `status` = 'AWAKE' WHERE `status` = 'KAGE_QUEUED';

ALTER TABLE `KageDefendedChallenges` MODIFY COLUMN `didWin` tinyint;
ALTER TABLE `KageDefendedChallenges` MODIFY COLUMN `rounds` int;
ALTER TABLE `UserData` MODIFY COLUMN `status` enum('AWAKE','HOSPITALIZED','TRAVEL','BATTLE','QUEUED','ASLEEP') NOT NULL DEFAULT 'AWAKE';
ALTER TABLE `KageDefendedChallenges` ADD `tenure` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `status` enum('QUEUED','SCHEDULED','STARTING','BATTLE','COMPLETED','CANCELLED','FORFEITED') DEFAULT 'COMPLETED' NOT NULL;
ALTER TABLE `KageDefendedChallenges` ADD `activeChallengerId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `status` IN ('QUEUED','SCHEDULED','STARTING','BATTLE') THEN `userId` ELSE NULL END) STORED;
ALTER TABLE `KageDefendedChallenges` ADD `scheduledAt` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `notBefore` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `checkedInAt` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `rescheduled` boolean DEFAULT false NOT NULL;
ALTER TABLE `KageDefendedChallenges` ADD `hospitalDeferred` boolean DEFAULT false NOT NULL;
ALTER TABLE `KageDefendedChallenges` ADD `aiRequested` boolean DEFAULT false NOT NULL;
ALTER TABLE `KageDefendedChallenges` ADD `aiAccepted` boolean DEFAULT false NOT NULL;
ALTER TABLE `KageDefendedChallenges` ADD `startedAt` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `resolvedAt` datetime(3);
ALTER TABLE `KageDefendedChallenges` ADD `outcome` varchar(512);
-- Existing rows are completed defenses. Their recorded result timestamp is the only
-- historical timing evidence; preserve it along with IDs, participants and battle results.
UPDATE `KageDefendedChallenges`
SET `notBefore` = `createdAt`, `startedAt` = `createdAt`, `resolvedAt` = `createdAt`,
    `outcome` = CASE WHEN `didWin` > 0 THEN 'Challenger won the title fight' ELSE 'Kage defended the title' END;
ALTER TABLE `KageDefendedChallenges` MODIFY COLUMN `notBefore` datetime(3) NOT NULL;
ALTER TABLE `KageDefendedChallenges` ALTER COLUMN `status` SET DEFAULT 'QUEUED';

ALTER TABLE `Village` ADD `kageSchedule` json;
ALTER TABLE `Village` ADD `kageScheduleVersion` int DEFAULT 0 NOT NULL;
ALTER TABLE `Village` ADD `kageScheduleAvailableAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `VillageElderVote` ADD `reason` varchar(1000) DEFAULT '' NOT NULL;
ALTER TABLE `VillageElderVote` ADD `tenure` datetime(3);
ALTER TABLE `VillageElderVote` ADD `resolvedAt` datetime(3);
ALTER TABLE `VillageElderVote` ADD `successorId` varchar(191);
ALTER TABLE `KageDefendedChallenges` ADD CONSTRAINT `KageDefendedChallenges_activeChallenger_key` UNIQUE(`activeChallengerId`);
CREATE INDEX `KageDefendedChallenges_village_status_created_idx` ON `KageDefendedChallenges` (`villageId`,`status`,`createdAt`);
CREATE INDEX `KageDefendedChallenges_user_started_idx` ON `KageDefendedChallenges` (`userId`,`startedAt`);
ALTER TABLE `Village` DROP COLUMN `openForChallenges`;
ALTER TABLE `Village` DROP COLUMN `openForChallengesAt`;
