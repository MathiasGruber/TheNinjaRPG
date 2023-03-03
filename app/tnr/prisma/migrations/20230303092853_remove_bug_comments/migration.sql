/*
  Warnings:

  - You are about to drop the `BugComment` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `conversationId` to the `BugReport` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `BugComment` DROP FOREIGN KEY `BugComment_bugId_fkey`;

-- DropForeignKey
ALTER TABLE `BugComment` DROP FOREIGN KEY `BugComment_userId_fkey`;

-- AlterTable
ALTER TABLE `BugReport` ADD COLUMN `conversationId` VARCHAR(191) NOT NULL;

-- DropTable
DROP TABLE `BugComment`;

-- AddForeignKey
ALTER TABLE `BugReport` ADD CONSTRAINT `BugReport_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
