/*
  Warnings:

  - You are about to drop the `BattleAction` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `actions` to the `Battle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Battle` ADD COLUMN `actions` JSON NOT NULL;

-- AlterTable
ALTER TABLE `UserData` MODIFY `regeneration` INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE `BattleAction`;
