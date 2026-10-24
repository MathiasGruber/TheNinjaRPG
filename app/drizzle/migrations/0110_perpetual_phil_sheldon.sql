ALTER TABLE `WebStoreBundle` ADD `purchaseLimit` int DEFAULT 0 NOT NULL;
ALTER TABLE `WebStoreOrder` ADD `bundleId` varchar(191);
ALTER TABLE `WebStoreOrder` ADD `captureAttemptId` varchar(191);
CREATE INDEX `WebStoreOrder_buyer_bundle_idx` ON `WebStoreOrder` (`buyerId`,`bundleId`);