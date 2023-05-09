/*
  Warnings:

  - You are about to drop the column `actions` on the `Battle` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Battle` DROP COLUMN `actions`;

-- CreateTable
CREATE TABLE `BattleAction` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `battleId` VARCHAR(191) NOT NULL,
    `battleVersion` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    INDEX `BattleAction_battleId_idx`(`battleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
