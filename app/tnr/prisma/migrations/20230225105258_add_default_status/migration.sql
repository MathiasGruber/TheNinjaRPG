/*
  Warnings:

  - Made the column `status` on table `UserReport` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `UserReport` MODIFY `status` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVE', 'BAN_ESCALATED', 'BAN_FINISHED') NOT NULL DEFAULT 'UNVIEWED';

-- AlterTable
ALTER TABLE `UserReportComment` MODIFY `decision` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVE', 'BAN_ESCALATED', 'BAN_FINISHED') NULL;
