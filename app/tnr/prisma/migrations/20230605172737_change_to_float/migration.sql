/*
  Warnings:

  - You are about to alter the column `strength` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `intelligence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `willpower` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `speed` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `ninjutsu_offence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `ninjutsu_defence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `genjutsu_offence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `genjutsu_defence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `taijutsu_offence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `taijutsu_defence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `bukijutsu_defence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `bukijutsu_offence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `UserData` MODIFY `strength` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `intelligence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `willpower` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `speed` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `ninjutsu_offence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `ninjutsu_defence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `genjutsu_offence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `genjutsu_defence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `taijutsu_offence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `taijutsu_defence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `bukijutsu_defence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `bukijutsu_offence` DOUBLE NOT NULL DEFAULT 10;
