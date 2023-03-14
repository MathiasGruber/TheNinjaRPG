/*
  Warnings:

  - A unique constraint covering the columns `[orderId]` on the table `PaypalTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `PaypalTransaction` MODIFY `invoiceId` VARCHAR(191) NULL,
    MODIFY `orderId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `PaypalTransaction_orderId_key` ON `PaypalTransaction`(`orderId`);
