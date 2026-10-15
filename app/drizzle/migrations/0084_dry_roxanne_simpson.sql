CREATE TABLE `WarActionReceipt` (
	`applied` boolean NOT NULL DEFAULT false,
	`damage` int NOT NULL DEFAULT 0,
	`recovery` int NOT NULL DEFAULT 0,
	`shrineDamage` int NOT NULL DEFAULT 0,
	`captured` boolean NOT NULL DEFAULT false,
	`id` varchar(191) NOT NULL,
	`warId` varchar(191) NOT NULL,
	CONSTRAINT `WarActionReceipt_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarCamp` (
	`id` varchar(191) NOT NULL,
	`warId` varchar(191) NOT NULL,
	`sector` smallint NOT NULL,
	`guardianId` varchar(191) NOT NULL,
	`startsAt` datetime(3) NOT NULL,
	`endsAt` datetime(3) NOT NULL,
	`attackerScore` int NOT NULL DEFAULT 0,
	`defenderScore` int NOT NULL DEFAULT 0,
	`resolvedAt` datetime(3),
	CONSTRAINT `WarCamp_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarContribution` (
	`warId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`damage` int NOT NULL DEFAULT 0,
	`recovery` int NOT NULL DEFAULT 0,
	`convertedAt` datetime(3),
	`expiredAt` datetime(3),
	CONSTRAINT `WarContribution_warId_userId_pk` PRIMARY KEY(`warId`,`userId`)
);

ALTER TABLE `Sector` ADD `boostLockedUntil` datetime(3);
ALTER TABLE `UserData` ADD `isWarCamp` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserData` ADD `warMission` json;
ALTER TABLE `UserData` ADD `bracketImmunityPausedAt` datetime(3);
ALTER TABLE `War` ADD `rules` json;
ALTER TABLE `War` ADD `objectiveState` json;
ALTER TABLE `War` ADD `combatStartedAt` datetime(3);
CREATE INDEX `WarCamp_warId_idx` ON `WarCamp` (`warId`);
CREATE INDEX `WarCamp_unresolved_idx` ON `WarCamp` (`resolvedAt`,`endsAt`);
CREATE INDEX `WarContribution_user_claim_idx` ON `WarContribution` (`userId`,`convertedAt`,`expiredAt`);