/*
  Warnings:

  - You are about to drop the column `chakraCost` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `staminaCost` on the `Item` table. All the data in the column will be lost.
  - The values [NONE] on the enum `Item_weaponType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `chakraCost` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `healthCost` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `level` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `staminaCost` on the `Jutsu` table. All the data in the column will be lost.
  - The values [NONE] on the enum `Item_weaponType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[image]` on the table `Item` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `image` to the `Item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Item` DROP COLUMN `chakraCost`,
    DROP COLUMN `staminaCost`,
    ADD COLUMN `chakraCostPerc` DOUBLE NOT NULL DEFAULT 0.01,
    ADD COLUMN `image` VARCHAR(191) NOT NULL,
    ADD COLUMN `staminaCostPerc` DOUBLE NOT NULL DEFAULT 0.01,
    MODIFY `cost` INTEGER NOT NULL DEFAULT 1,
    MODIFY `weaponType` ENUM('STAFF', 'AXE', 'FIST_WEAPON', 'SICKLE', 'DAGGER', 'SWORD', 'POLEARM', 'FLAIL', 'CHAIN', 'FAN', 'BOW') NOT NULL;

-- AlterTable
ALTER TABLE `Jutsu` DROP COLUMN `chakraCost`,
    DROP COLUMN `healthCost`,
    DROP COLUMN `level`,
    DROP COLUMN `staminaCost`,
    ADD COLUMN `chakraCostPerc` DOUBLE NOT NULL DEFAULT 0.05,
    ADD COLUMN `healthCostPerc` DOUBLE NOT NULL DEFAULT 0,
    ADD COLUMN `jutsuRank` ENUM('D', 'C', 'B', 'A', 'S') NOT NULL DEFAULT 'D',
    ADD COLUMN `staminaCostPerc` DOUBLE NOT NULL DEFAULT 0.05,
    MODIFY `jutsuWeapon` ENUM('STAFF', 'AXE', 'FIST_WEAPON', 'SICKLE', 'DAGGER', 'SWORD', 'POLEARM', 'FLAIL', 'CHAIN', 'FAN', 'BOW') NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Item_image_key` ON `Item`(`image`);
