-- DropForeignKey
ALTER TABLE `BugComment` DROP FOREIGN KEY `BugComment_bugId_fkey`;

-- DropForeignKey
ALTER TABLE `BugComment` DROP FOREIGN KEY `BugComment_userId_fkey`;

-- DropForeignKey
ALTER TABLE `BugReport` DROP FOREIGN KEY `BugReport_userId_fkey`;

-- DropForeignKey
ALTER TABLE `BugVotes` DROP FOREIGN KEY `BugVotes_bugId_fkey`;

-- DropForeignKey
ALTER TABLE `BugVotes` DROP FOREIGN KEY `BugVotes_userId_fkey`;

-- DropForeignKey
ALTER TABLE `HistoricalAvatar` DROP FOREIGN KEY `HistoricalAvatar_userId_fkey`;

-- DropForeignKey
ALTER TABLE `UserAttribute` DROP FOREIGN KEY `UserAttribute_userId_fkey`;

-- AddForeignKey
ALTER TABLE `UserAttribute` ADD CONSTRAINT `UserAttribute_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalAvatar` ADD CONSTRAINT `HistoricalAvatar_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugReport` ADD CONSTRAINT `BugReport_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugVotes` ADD CONSTRAINT `BugVotes_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `BugReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugVotes` ADD CONSTRAINT `BugVotes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugComment` ADD CONSTRAINT `BugComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugComment` ADD CONSTRAINT `BugComment_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `BugReport`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
