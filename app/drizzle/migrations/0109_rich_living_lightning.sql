DROP INDEX `Bloodline_village_idx` ON `Bloodline`;
ALTER TABLE `Bloodline` RENAME COLUMN `village` TO `villageId`;
ALTER TABLE `Bloodline` MODIFY COLUMN `villageId` varchar(191) DEFAULT null;
ALTER TABLE `Bloodline` MODIFY COLUMN `villageId` varchar(191);
CREATE INDEX `Bloodline_village_idx` ON `Bloodline` (`villageId`);
UPDATE `Bloodline` SET `villageId` = NULL WHERE `villageId` = "" OR `villageId` = "All";