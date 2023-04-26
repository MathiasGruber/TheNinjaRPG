-- AlterTable
ALTER TABLE `Jutsu` ADD COLUMN `villageId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Jutsu_villageId_idx` ON `Jutsu`(`villageId`);
