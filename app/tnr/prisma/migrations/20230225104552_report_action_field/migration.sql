/*
  Warnings:

  - You are about to drop the column `is_resolved` on the `UserReport` table. All the data in the column will be lost.
  - You are about to drop the column `banLength` on the `UserReportComment` table. All the data in the column will be lost.
  - The values [CLEAR,BAN] on the enum `UserReportComment_decision` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `UserReport` DROP COLUMN `is_resolved`,
    ADD COLUMN `status` ENUM('REPORT_CLEARED', 'BAN_ACTIVE', 'BAN_ESCALATED', 'BAN_FINISHED') NULL;

-- AlterTable
ALTER TABLE `UserReportComment` DROP COLUMN `banLength`,
    MODIFY `decision` ENUM('REPORT_CLEARED', 'BAN_ACTIVE', 'BAN_ESCALATED', 'BAN_FINISHED') NULL;
