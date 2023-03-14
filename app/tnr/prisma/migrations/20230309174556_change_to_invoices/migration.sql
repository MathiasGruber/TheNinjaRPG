/*
  Warnings:

  - You are about to drop the `PaypalTransaction` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `PaypalTransaction` DROP FOREIGN KEY `PaypalTransaction_createdById_fkey`;

-- DropTable
DROP TABLE `PaypalTransaction`;

-- CreateTable
CREATE TABLE `PaypalInvoices` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `customId` VARCHAR(191) NOT NULL,
    `invoiceId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL,
    `currency` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `invoice` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PaypalInvoices` ADD CONSTRAINT `PaypalInvoices_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
