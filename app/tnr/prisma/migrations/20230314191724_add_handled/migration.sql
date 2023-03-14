-- AlterTable
ALTER TABLE `PaypalWebhookMessage` ADD COLUMN `handled` BOOLEAN NOT NULL DEFAULT false;
