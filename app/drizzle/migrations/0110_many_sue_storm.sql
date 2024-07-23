ALTER TABLE `Bloodline` MODIFY COLUMN `villageId` varchar(191) DEFAULT NULL;
ALTER TABLE `UserData` DROP COLUMN `curEnergy`;
ALTER TABLE `UserData` DROP COLUMN `maxEnergy`;