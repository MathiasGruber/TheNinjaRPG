/*
  Warnings:

  - Added the required column `effects` to the `Bloodline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `id` to the `UserData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Bloodline` ADD COLUMN `effects` JSON NOT NULL;

-- AlterTable
ALTER TABLE `UserData` ADD COLUMN `battleId` VARCHAR(191) NULL,
    ADD COLUMN `id` INTEGER NOT NULL AUTO_INCREMENT,
    ADD COLUMN `isAI` BOOLEAN NOT NULL DEFAULT false,
    ADD PRIMARY KEY (`id`);

-- CreateTable
CREATE TABLE `Jutsu` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `effects` JSON NOT NULL,
    `type` ENUM('NINJUTSU', 'GENJUTSU', 'TAIJUTSU', 'WEAPON', 'BASIC') NOT NULL,
    `rank` ENUM('D', 'C', 'B', 'A', 'S') NOT NULL,
    `element1` ENUM('FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'NONE') NOT NULL DEFAULT 'NONE',
    `element2` ENUM('FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'NONE') NOT NULL DEFAULT 'NONE',
    `element3` ENUM('FIRE', 'WATER', 'WIND', 'EARTH', 'LIGHTNING', 'NONE') NOT NULL DEFAULT 'NONE',
    `target` ENUM('SELF', 'OPPONENT', 'GROUND') NOT NULL,
    `range` INTEGER NOT NULL,
    `cost` INTEGER NOT NULL DEFAULT 0,
    `cooldown` INTEGER NOT NULL DEFAULT 0,
    `bloodlineId` VARCHAR(191) NULL,

    UNIQUE INDEX `Jutsu_name_key`(`name`),
    INDEX `Jutsu_bloodlineId_idx`(`bloodlineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Item` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `effects` JSON NOT NULL,
    `type` ENUM('WEAPON', 'ARMOR', 'ACCESSORY', 'CONSUMABLE', 'MATERIAL', 'OTHER') NOT NULL,
    `rarity` ENUM('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY') NOT NULL,
    `slot` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'HANDS', 'NECK', 'RING', 'MAINHAND', 'OFFHAND', 'BACKPACK') NOT NULL,
    `cost` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Item_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Battle` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `background` VARCHAR(191) NOT NULL,
    `battleType` ENUM('ARENA', 'COMBAT', 'SPARRING') NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BattleAction` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `battleId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    INDEX `BattleAction_battleId_idx`(`battleId`),
    INDEX `BattleAction_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BattleEffects` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `effect` JSON NOT NULL,
    `endRound` INTEGER NOT NULL,
    `hexColumn` INTEGER NOT NULL,
    `hexRow` INTEGER NOT NULL,
    `actionId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,

    INDEX `BattleEffects_actionId_idx`(`actionId`),
    INDEX `BattleEffects_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_JutsuToUserData` (
    `A` VARCHAR(191) NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_JutsuToUserData_AB_unique`(`A`, `B`),
    INDEX `_JutsuToUserData_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ItemToUserData` (
    `A` VARCHAR(191) NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ItemToUserData_AB_unique`(`A`, `B`),
    INDEX `_ItemToUserData_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `UserData_battleId_idx` ON `UserData`(`battleId`);

-- CreateIndex
CREATE INDEX `UserData_userId_idx` ON `UserData`(`userId`);
