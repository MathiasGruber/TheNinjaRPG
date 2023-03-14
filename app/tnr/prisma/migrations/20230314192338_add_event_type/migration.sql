/*
  Warnings:

  - Added the required column `eventType` to the `PaypalWebhookMessage` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `PaypalWebhookMessage` ADD COLUMN `eventType` VARCHAR(191) NOT NULL;
