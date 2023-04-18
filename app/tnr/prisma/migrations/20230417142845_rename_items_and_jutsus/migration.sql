/*
  Warnings:

  - Added the required column `usersState` to the `Battle` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Battle` ADD COLUMN `usersState` JSON NOT NULL;
