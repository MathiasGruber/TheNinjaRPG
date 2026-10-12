CREATE TABLE `SanctionTombstone` (
	`userId` varchar(191) NOT NULL,
	`sourceId` varchar(191) NOT NULL,
	`sanction` enum('BAN','SILENCE') NOT NULL,
	`sanctionEndsAt` datetime(3) NOT NULL,
	`reportIds` json NOT NULL,
	`emailHash` varchar(64),
	`accountHashes` json NOT NULL,
	`carryoverReportIds` json NOT NULL DEFAULT ('[]'),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `SanctionTombstone_userId_sourceId_pk` PRIMARY KEY(`userId`,`sourceId`)
);

CREATE INDEX `SanctionTombstone_sanctionEndsAt_idx` ON `SanctionTombstone` (`sanctionEndsAt`);