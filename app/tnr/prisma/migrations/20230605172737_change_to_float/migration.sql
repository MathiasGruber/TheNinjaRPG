/*
  Warnings:

  - You are about to alter the column `strength` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `intelligence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `willpower` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `speed` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `ninjutsuOffence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `ninjutsuDefence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `genjutsuOffence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `genjutsuDefence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `taijutsuOffence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `taijutsuDefence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `bukijutsuDefence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.
  - You are about to alter the column `bukijutsuOffence` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Double`.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `UserData` MODIFY `strength` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `intelligence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `willpower` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `speed` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `ninjutsuOffence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `ninjutsuDefence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `genjutsuOffence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `genjutsuDefence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `taijutsuOffence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `taijutsuDefence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `bukijutsuDefence` DOUBLE NOT NULL DEFAULT 10,
    MODIFY `bukijutsuOffence` DOUBLE NOT NULL DEFAULT 10;
