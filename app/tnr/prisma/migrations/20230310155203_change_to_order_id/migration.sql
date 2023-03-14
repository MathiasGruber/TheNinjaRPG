/*
  Warnings:

  - You are about to drop the column `invoiceId` on the `PaypalInvoices` table. All the data in the column will be lost.
  - Added the required column `orderId` to the `PaypalInvoices` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `PaypalInvoices` DROP COLUMN `invoiceId`,
    ADD COLUMN `orderId` VARCHAR(191) NOT NULL;
