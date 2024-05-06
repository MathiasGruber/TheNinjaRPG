CREATE TABLE `RyoTrade` (
	`id` varchar(191) NOT NULL,
	`creatorUserId` varchar(191) NOT NULL,
	`repsForSale` int NOT NULL,
	`requestedRyo` bigint NOT NULL,
	`ryoPerRep` double NOT NULL,
	`purchaserUserId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `RyoTrade_id` PRIMARY KEY(`id`)
);

CREATE INDEX `RyoTrade_creatorUserId_idx` ON `RyoTrade` (`creatorUserId`);