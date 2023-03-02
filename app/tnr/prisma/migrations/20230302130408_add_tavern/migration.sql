/*
  Warnings:

  - The values [BAN_FINISHED] on the enum `UserReportComment_decision` will be removed. If these variants are still used in the database, this will fail.
  - The values [BAN_FINISHED] on the enum `UserReportComment_decision` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `UserReport` MODIFY `status` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED') NOT NULL DEFAULT 'UNVIEWED';

-- AlterTable
ALTER TABLE `UserReportComment` MODIFY `decision` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED') NULL;

-- CreateTable
CREATE TABLE `TavernComment` (
    `id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `tavern` ENUM('GLOBAL', 'KONOKI') NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TavernComment` ADD CONSTRAINT `TavernComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
