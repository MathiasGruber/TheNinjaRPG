/*
  Warnings:

  - You are about to drop the column `cost` on the `Jutsu` table. All the data in the column will be lost.
  - Added the required column `target` to the `Item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Item` ADD COLUMN `canStack` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `chakraCost` DOUBLE NOT NULL DEFAULT 0.01,
    ADD COLUMN `stackSize` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `staminaCost` DOUBLE NOT NULL DEFAULT 0.01,
    ADD COLUMN `target` ENUM('SELF', 'OPPONENT', 'GROUND') NOT NULL;

-- AlterTable
ALTER TABLE `Jutsu` DROP COLUMN `cost`,
    ADD COLUMN `chakraCost` DOUBLE NOT NULL DEFAULT 0.05,
    ADD COLUMN `healthCost` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `staminaCost` DOUBLE NOT NULL DEFAULT 0.05;
