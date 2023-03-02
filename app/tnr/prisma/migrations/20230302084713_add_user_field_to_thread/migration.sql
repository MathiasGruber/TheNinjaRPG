/*
  Warnings:

  - Added the required column `userId` to the `ForumThread` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ForumThread` ADD COLUMN `userId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `ForumThread` ADD CONSTRAINT `ForumThread_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
