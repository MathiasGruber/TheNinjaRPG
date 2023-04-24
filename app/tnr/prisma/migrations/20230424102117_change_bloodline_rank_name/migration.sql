/*
  Warnings:

  - You are about to drop the column `rarity` on the `Bloodline` table. All the data in the column will be lost.
  - Added the required column `rank` to the `Bloodline` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Bloodline_rarity_idx` ON `Bloodline`;

-- AlterTable
ALTER TABLE `Bloodline` DROP COLUMN `rarity`,
    ADD COLUMN `rank` ENUM('D', 'C', 'B', 'A', 'S') NOT NULL;

-- AlterTable
ALTER TABLE `Item` MODIFY `chakraCostPerc` DOUBLE NOT NULL DEFAULT 0,
    MODIFY `staminaCostPerc` DOUBLE NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Jutsu` MODIFY `staminaCostPerc` DOUBLE NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `Bloodline_rank_idx` ON `Bloodline`(`rank`);
