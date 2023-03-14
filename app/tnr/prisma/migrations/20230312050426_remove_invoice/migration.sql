/*
  Warnings:

  - You are about to drop the column `invoiceId` on the `PaypalTransaction` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `PaypalTransaction` DROP COLUMN `invoiceId`;
