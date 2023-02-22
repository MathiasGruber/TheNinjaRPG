-- DropForeignKey
ALTER TABLE `UserReport` DROP FOREIGN KEY `UserReport_reportedUserId_fkey`;

-- DropForeignKey
ALTER TABLE `UserReport` DROP FOREIGN KEY `UserReport_reporterUserId_fkey`;

-- DropForeignKey
ALTER TABLE `UserReportComment` DROP FOREIGN KEY `UserReportComment_userId_fkey`;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_reporterUserId_fkey` FOREIGN KEY (`reporterUserId`) REFERENCES `UserData`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_reportedUserId_fkey` FOREIGN KEY (`reportedUserId`) REFERENCES `UserData`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReportComment` ADD CONSTRAINT `UserReportComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
