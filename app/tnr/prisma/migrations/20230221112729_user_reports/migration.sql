-- AlterTable
ALTER TABLE `UserData` ADD COLUMN `banned` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `UserReport` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `system` VARCHAR(191) NOT NULL,
    `infraction` JSON NOT NULL,
    `reportReason` VARCHAR(191) NOT NULL,
    `resolution` VARCHAR(191) NULL,
    `banEnd` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserReportComment` (
    `id` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserReport` ADD CONSTRAINT `UserReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReportComment` ADD CONSTRAINT `UserReportComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserReportComment` ADD CONSTRAINT `UserReportComment_reportId_fkey` FOREIGN KEY (`reportId`) REFERENCES `UserReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
