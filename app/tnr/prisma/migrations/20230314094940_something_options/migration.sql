-- AlterTable
ALTER TABLE `PaypalTransaction` MODIFY `transactionId` VARCHAR(191) NULL,
    MODIFY `transactionUpdatedDate` VARCHAR(191) NULL,
    MODIFY `amount` DOUBLE NOT NULL DEFAULT 0,
    MODIFY `currency` VARCHAR(191) NOT NULL DEFAULT 'USD';
