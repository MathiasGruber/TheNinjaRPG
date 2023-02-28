-- AlterTable
ALTER TABLE `UserReportComment` ADD COLUMN `banLength` VARCHAR(191) NULL,
    ADD COLUMN `decision` ENUM('CLEAR', 'BAN') NULL;
