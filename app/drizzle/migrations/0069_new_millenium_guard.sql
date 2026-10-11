CREATE TABLE `ParentalControl` (
	`userId` varchar(191) NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`tavernDisabled` boolean NOT NULL DEFAULT false,
	`privateMessages` enum('EVERYONE','APPROVED','NONE') NOT NULL DEFAULT 'EVERYONE',
	`approvedUserIds` json NOT NULL DEFAULT ('[]'),
	`pinHash` varchar(191),
	`failedAttempts` int NOT NULL DEFAULT 0,
	`attemptWindowStart` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`version` int NOT NULL DEFAULT 0,
	CONSTRAINT `ParentalControl_userId` PRIMARY KEY(`userId`)
);
