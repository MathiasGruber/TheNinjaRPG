/*
  Warnings:

  - You are about to drop the column `isBanned` on the `UserData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `User` ADD COLUMN `isBanned` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `UserData` DROP COLUMN `isBanned`;
