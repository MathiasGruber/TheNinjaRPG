UPDATE `UserData` SET `customTitle` = '' WHERE `customTitle` IS NULL;
ALTER TABLE `UserData` MODIFY COLUMN `customTitle` varchar(191) NOT NULL;