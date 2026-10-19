CREATE TABLE `TowerDefenseClaimReceipt` (
	`id` varchar(191) NOT NULL,
	`claimKey` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`spacetimeSessionId` varchar(191) NOT NULL,
	`wave` int NOT NULL,
	`score` int NOT NULL,
	`pointsEarned` int NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `TowerDefenseClaimReceipt_id` PRIMARY KEY(`id`),
	CONSTRAINT `TowerDefenseClaimReceipt_claimKey_key` UNIQUE(`claimKey`)
);

CREATE INDEX `TowerDefenseClaimReceipt_userId_idx` ON `TowerDefenseClaimReceipt` (`userId`);