-- CreateTable
CREATE TABLE `ReportLog` (
    `id` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NULL,
    `staffUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ReportLog` ADD CONSTRAINT `ReportLog_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `UserData`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReportLog` ADD CONSTRAINT `ReportLog_staffUserId_fkey` FOREIGN KEY (`staffUserId`) REFERENCES `UserData`(`userId`) ON DELETE SET NULL ON UPDATE CASCADE;
