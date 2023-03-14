/*
  Warnings:

  - You are about to drop the column `subscriptionId` on the `PaypalTransaction` table. All the data in the column will be lost.
  - Made the column `transactionId` on table `PaypalTransaction` required. This step will fail if there are existing NULL values in that column.
  - Made the column `transactionUpdatedDate` on table `PaypalTransaction` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `PaypalTransaction` DROP COLUMN `subscriptionId`,
    MODIFY `transactionId` VARCHAR(191) NOT NULL,
    MODIFY `transactionUpdatedDate` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `PaypalSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `affectedUserId` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaypalSubscription_orderId_key`(`orderId`),
    UNIQUE INDEX `PaypalSubscription_subscriptionId_key`(`subscriptionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaypalSubscription` ADD CONSTRAINT `PaypalSubscription_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaypalSubscription` ADD CONSTRAINT `PaypalSubscription_affectedUserId_fkey` FOREIGN KEY (`affectedUserId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
