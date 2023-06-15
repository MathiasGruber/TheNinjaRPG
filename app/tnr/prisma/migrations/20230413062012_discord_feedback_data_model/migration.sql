/*
  Warnings:

  - You are about to drop the column `type` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `weapon_defence` on the `UserData` table. All the data in the column will be lost.
  - You are about to drop the column `weapon_offence` on the `UserData` table. All the data in the column will be lost.
  - Added the required column `weaponType` to the `Item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `attackType` to the `Jutsu` table without a default value. This is not possible if the table is not empty.
  - Added the required column `jutsuType` to the `Jutsu` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Item` ADD COLUMN `weaponType` ENUM('STAFF', 'AXE', 'FIST_WEAPON', 'SICKLE', 'DAGGER', 'SWORD', 'POLEARM', 'FLAIL', 'CHAIN', 'FAN', 'BOW', 'NONE') NOT NULL,
    MODIFY `type` ENUM('WEAPON', 'ARMOR', 'ACCESSORY', 'CONSUMABLE', 'MATERIAL', 'EVENT', 'OTHER') NOT NULL;

-- AlterTable
ALTER TABLE `Jutsu` DROP COLUMN `type`,
    ADD COLUMN `attackType` ENUM('HIGHEST', 'NINJUTSU', 'GENJUTSU', 'TAIJUTSU', 'BUKIJUTSU', 'BASIC') NOT NULL,
    ADD COLUMN `jutsuType` ENUM('NORMAL', 'SPECIAL', 'BLOODLINE', 'FORBIDDEN', 'LOYALTY', 'CLAN', 'EVENT') NOT NULL;

-- AlterTable
ALTER TABLE `UserData` DROP COLUMN `weapon_defence`,
    DROP COLUMN `weapon_offence`,
    ADD COLUMN `bukijutsuDefence` INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN `bukijutsuOffence` INTEGER NOT NULL DEFAULT 10;
