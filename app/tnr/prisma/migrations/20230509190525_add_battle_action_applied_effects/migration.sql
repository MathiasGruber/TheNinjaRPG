/*
  Warnings:

  - Added the required column `appliedEffects` to the `BattleAction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `BattleAction` ADD COLUMN `appliedEffects` JSON NOT NULL;
