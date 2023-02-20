/*
  Warnings:

  - You are about to drop the `BugUpVotes` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `BugUpVotes` DROP FOREIGN KEY `BugUpVotes_bugId_fkey`;

-- DropForeignKey
ALTER TABLE `BugUpVotes` DROP FOREIGN KEY `BugUpVotes_userId_fkey`;

-- DropTable
DROP TABLE `BugUpVotes`;

-- CreateTable
CREATE TABLE `BugVotes` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `value` TINYINT NOT NULL,
    `bugId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `BugVotes_bugId_userId_key`(`bugId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `BugVotes` ADD CONSTRAINT `BugVotes_bugId_fkey` FOREIGN KEY (`bugId`) REFERENCES `BugReport`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BugVotes` ADD CONSTRAINT `BugVotes_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE RESTRICT ON UPDATE CASCADE;
