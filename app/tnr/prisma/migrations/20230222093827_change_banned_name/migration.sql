/*
  Warnings:

  - You are about to drop the column `banned` on the `UserData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `UserData` DROP COLUMN `banned`,
    ADD COLUMN `isBanned` BOOLEAN NOT NULL DEFAULT false;
