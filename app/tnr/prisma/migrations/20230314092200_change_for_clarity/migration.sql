/*
  Warnings:

  - You are about to drop the column `customId` on the `PaypalTransaction` table. All the data in the column will be lost.
  - Added the required column `affectedUserId` to the `PaypalTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `PaypalTransaction` DROP FOREIGN KEY `PaypalTransaction_customId_fkey`;

-- AlterTable
ALTER TABLE `PaypalTransaction` DROP COLUMN `customId`,
    ADD COLUMN `affectedUserId` VARCHAR(191) NOT NULL;

-- AddForeignKey
ALTER TABLE `PaypalTransaction` ADD CONSTRAINT `PaypalTransaction_affectedUserId_fkey` FOREIGN KEY (`affectedUserId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
