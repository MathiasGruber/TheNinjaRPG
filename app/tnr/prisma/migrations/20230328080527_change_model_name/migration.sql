/*
  Warnings:

  - You are about to drop the `VillageStructures` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `VillageStructures` DROP FOREIGN KEY `VillageStructures_villageId_fkey`;

-- DropTable
DROP TABLE `VillageStructures`;

-- CreateTable
CREATE TABLE `VillageStructure` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `villageId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `max_level` INTEGER NOT NULL DEFAULT 10,
    `cur_sp` INTEGER NOT NULL DEFAULT 100,
    `max_sp` INTEGER NOT NULL DEFAULT 100,

    UNIQUE INDEX `VillageStructure_name_villageId_key`(`name`, `villageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VillageStructure` ADD CONSTRAINT `VillageStructure_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `Village`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
