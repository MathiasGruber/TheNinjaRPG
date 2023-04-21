/*
  Warnings:

  - You are about to drop the `BattleEffects` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `usersEffects` to the `Battle` table without a default value. This is not possible if the table is not empty.
  - Added the required column `range` to the `Item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Battle` ADD COLUMN `usersEffects` JSON NOT NULL;

-- AlterTable
ALTER TABLE `Item` ADD COLUMN `range` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `UserItem` ADD COLUMN `equipped` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `UserJutsu` ADD COLUMN `equipped` BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE `BattleEffects`;
