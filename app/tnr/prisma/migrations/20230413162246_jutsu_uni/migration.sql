/*
  Warnings:

  - Added the required column `description` to the `Bloodline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rarity` to the `Bloodline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `village` to the `Bloodline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `battleDescription` to the `Jutsu` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Bloodline` ADD COLUMN `description` TEXT NOT NULL,
    ADD COLUMN `rarity` ENUM('D', 'C', 'B', 'A', 'S') NOT NULL,
    ADD COLUMN `regenIncrease` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `village` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Jutsu` ADD COLUMN `battleDescription` TEXT NOT NULL;

-- CreateIndex
CREATE INDEX `Bloodline_village_idx` ON `Bloodline`(`village`);

-- CreateIndex
CREATE INDEX `Bloodline_rarity_idx` ON `Bloodline`(`rarity`);
