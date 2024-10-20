ALTER TABLE `GameAsset` ADD `createdAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `GameAsset` ADD `updatedAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `GameAsset` ADD `licenseDetails` text DEFAULT ('TNR') NOT NULL;
ALTER TABLE `GameAsset` ADD `createdByUserId` varchar(191);
UPDATE `GameAsset` SET licenseDetails = 'UPDATE `GameAsset` SET licenseDetails = "https://craftpix.net/file-licenses/"';