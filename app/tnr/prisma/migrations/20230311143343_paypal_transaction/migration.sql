/*
  Warnings:

  - Added the required column `orderId` to the `PaypalTransaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `PaypalTransaction` ADD COLUMN `orderId` VARCHAR(191) NOT NULL;
