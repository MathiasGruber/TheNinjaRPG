/*
  Warnings:

  - Added the required column `image` to the `Jutsu` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Jutsu` ADD COLUMN `image` VARCHAR(191) NOT NULL,
    ADD COLUMN `jutsuWeapon` ENUM('STAFF', 'AXE', 'FIST_WEAPON', 'SICKLE', 'DAGGER', 'SWORD', 'POLEARM', 'FLAIL', 'CHAIN', 'FAN', 'BOW', 'NONE') NULL;
