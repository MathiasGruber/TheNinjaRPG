CREATE TABLE `AuctionRequest` (
       `id` varchar(191) NOT NULL,
       `type` enum('CRAFT','REPAIR') NOT NULL,
       `details` text NOT NULL,
       `price` int NOT NULL,
       `creatorId` varchar(191) NOT NULL,
       `acceptedById` varchar(191),
       `status` enum('PENDING','ACCEPTED','COMPLETED') NOT NULL DEFAULT 'PENDING',
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `itemId` varchar(191),
       CONSTRAINT `AuctionRequest_id` PRIMARY KEY(`id`)
);

CREATE TABLE `Bid` (
       `id` varchar(191) NOT NULL,
       `name` varchar(191) NOT NULL,
       `description` text NOT NULL,
       `reward` json NOT NULL,
       `startingPrice` int NOT NULL,
       `closureDate` datetime(3) NOT NULL,
       `creatorId` varchar(191) NOT NULL,
       `acceptedById` varchar(191),
       `status` enum('ACTIVE','COMPLETED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `Bid_id` PRIMARY KEY(`id`)
);

CREATE TABLE `PlayerShop` (
       `id` varchar(191) NOT NULL,
       `name` varchar(191) NOT NULL,
       `description` text NOT NULL,
       `ownerId` varchar(191) NOT NULL,
       `notice` text,
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `PlayerShop_id` PRIMARY KEY(`id`),
       CONSTRAINT `PlayerShop_name_key` UNIQUE(`name`)
);

CREATE TABLE `ShopItem` (
       `id` varchar(191) NOT NULL,
       `shopId` varchar(191) NOT NULL,
       `itemId` varchar(191) NOT NULL,
       `price` int NOT NULL,
       `quantity` int NOT NULL,
       CONSTRAINT `ShopItem_id` PRIMARY KEY(`id`)
);

CREATE INDEX `AuctionRequest_creatorId_idx` ON `AuctionRequest` (`creatorId`);
CREATE INDEX `AuctionRequest_acceptedById_idx` ON `AuctionRequest` (`acceptedById`);
CREATE INDEX `AuctionRequest_status_idx` ON `AuctionRequest` (`status`);
CREATE INDEX `Bid_creatorId_idx` ON `Bid` (`creatorId`);
CREATE INDEX `Bid_acceptedById_idx` ON `Bid` (`acceptedById`);
CREATE INDEX `Bid_status_idx` ON `Bid` (`status`);
CREATE INDEX `PlayerShop_ownerId_idx` ON `PlayerShop` (`ownerId`);
CREATE INDEX `ShopItem_shopId_idx` ON `ShopItem` (`shopId`);
CREATE INDEX `ShopItem_itemId_idx` ON `ShopItem` (`itemId`);
