/*
  Warnings:

  - The values [BAN_ACTIVE] on the enum `UserReportComment_decision` will be removed. If these variants are still used in the database, this will fail.
  - The values [BAN_ACTIVE] on the enum `UserReportComment_decision` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `UserReport` MODIFY `status` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED', 'BAN_FINISHED') NOT NULL DEFAULT 'UNVIEWED';

-- AlterTable
ALTER TABLE `UserReportComment` MODIFY `decision` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED', 'BAN_FINISHED') NULL;
