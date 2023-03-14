-- AlterTable
ALTER TABLE `PaypalTransaction` ADD COLUMN `subscriptionId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `UserData` ADD COLUMN `federalStatus` ENUM('NONE', 'NORMAL', 'SILVER', 'GOLD') NOT NULL DEFAULT 'NONE';
