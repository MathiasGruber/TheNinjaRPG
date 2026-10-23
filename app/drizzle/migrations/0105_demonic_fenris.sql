CREATE TABLE `WarMercenary` (
	`id` varchar(191) NOT NULL,
	`warId` varchar(191) NOT NULL,
	`sideVillageId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`invitedById` varchar(191) NOT NULL,
	`tokens` int unsigned NOT NULL,
	`slot` tinyint unsigned NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`acceptedAt` datetime(3),
	`endedAt` datetime(3),
	`activeSlot` tinyint unsigned GENERATED ALWAYS AS (CASE WHEN `endedAt` IS NULL THEN `slot` ELSE NULL END) STORED,
	`activeUserId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `acceptedAt` IS NOT NULL AND `endedAt` IS NULL THEN `userId` ELSE NULL END) STORED,
	`invitedUserId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `endedAt` IS NULL THEN `userId` ELSE NULL END) STORED,
	CONSTRAINT `WarMercenary_id` PRIMARY KEY(`id`),
	CONSTRAINT `WarMercenary_slot_key` UNIQUE(`warId`,`sideVillageId`,`activeSlot`),
	CONSTRAINT `WarMercenary_active_user_key` UNIQUE(`activeUserId`),
	CONSTRAINT `WarMercenary_invitation_key` UNIQUE(`warId`,`invitedUserId`)
);

CREATE INDEX `WarMercenary_user_idx` ON `WarMercenary` (`userId`);