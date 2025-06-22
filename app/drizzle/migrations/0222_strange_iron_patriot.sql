CREATE TABLE `DailyBankInterest` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`amount` bigint NOT NULL,
	`date` date NOT NULL,
	`claimed` boolean NOT NULL DEFAULT false,
	`interestPercent` int NOT NULL,
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `DailyBankInterest_id` PRIMARY KEY(`id`),
	CONSTRAINT `DailyBankInterest_userId_date_key` UNIQUE(`userId`,`date`)
);

CREATE INDEX `DailyBankInterest_userId_idx` ON `DailyBankInterest` (`userId`);