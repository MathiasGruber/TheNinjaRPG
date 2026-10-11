CREATE TABLE `AuctionOffer` (
	`id` varchar(191) NOT NULL,
	`ownerId` varchar(191) NOT NULL,
	`accepterId` varchar(191),
	`offerType` enum('REQUEST','TRADE') NOT NULL,
	`requestedItemId` varchar(191) NOT NULL,
	`requestedQuantity` int unsigned NOT NULL,
	`offeredUserItemId` varchar(191),
	`offeredQuantity` int unsigned,
	`ryo` int unsigned NOT NULL DEFAULT 0,
	`status` enum('ACTIVE','SOLD','EXPIRED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `AuctionOffer_id` PRIMARY KEY(`id`)
);

CREATE INDEX `AuctionOffer_ownerId_idx` ON `AuctionOffer` (`ownerId`);
CREATE INDEX `AuctionOffer_status_offerType_createdAt_idx` ON `AuctionOffer` (`status`,`offerType`,`createdAt`);
CREATE INDEX `AuctionOffer_requestedItemId_idx` ON `AuctionOffer` (`requestedItemId`);
CREATE INDEX `AuctionOffer_offeredUserItemId_idx` ON `AuctionOffer` (`offeredUserItemId`);