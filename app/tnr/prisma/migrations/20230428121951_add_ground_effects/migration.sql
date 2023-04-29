/*
  Warnings:

  - Added the required column `groundEffects` to the `Battle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Battle` ADD COLUMN `groundEffects` JSON NOT NULL;
