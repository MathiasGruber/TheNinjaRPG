/*
  Warnings:

  - The primary key for the `UserData` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `UserData` table. All the data in the column will be lost.
  - You are about to drop the `_ItemToUserData` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `_JutsuToUserData` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `UserData` DROP PRIMARY KEY,
    DROP COLUMN `id`;

-- DropTable
DROP TABLE `_ItemToUserData`;

-- DropTable
DROP TABLE `_JutsuToUserData`;

-- CreateTable
CREATE TABLE `UserJutsu` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `jutsuId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,

    INDEX `UserJutsu_userId_idx`(`userId`),
    INDEX `UserJutsu_jutsuId_idx`(`jutsuId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserItem` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `itemId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,

    INDEX `UserItem_userId_idx`(`userId`),
    INDEX `UserItem_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
