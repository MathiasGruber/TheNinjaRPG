/*
  Warnings:

  - You are about to drop the column `userId` on the `UserReport` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `UserReport` DROP FOREIGN KEY `UserReport_userId_fkey`;

-- AlterTable
ALTER TABLE `UserReport` DROP COLUMN `userId`,
    ADD COLUMN `reportedUserId` VARCHAR(191) NULL,
    ADD COLUMN `reporterUserId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_reporterUserId_fkey` FOREIGN KEY (`reporterUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_reportedUserId_fkey` FOREIGN KEY (`reportedUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
