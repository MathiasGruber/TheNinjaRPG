/*
  Warnings:

  - Added the required column `bugId` to the `BugComment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `BugComment` ADD COLUMN `bugId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `BugComment` ADD CONSTRAINT `BugComment_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `BugReport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
