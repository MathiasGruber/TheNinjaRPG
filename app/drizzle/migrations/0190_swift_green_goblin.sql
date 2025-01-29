DROP INDEX `AuctionRequest_acceptedById_idx` ON `AuctionRequest`;
DROP INDEX `Bid_acceptedById_idx` ON `Bid`;
ALTER TABLE `ShopItem` MODIFY COLUMN `quantity` int NOT NULL DEFAULT 1;
ALTER TABLE `AuctionRequest` DROP COLUMN `itemId`;
