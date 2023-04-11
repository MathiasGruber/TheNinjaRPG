/*
  Warnings:

  - You are about to drop the column `prompt` on the `HistoricalAvatar` table. All the data in the column will be lost.
  - You are about to drop the column `isBanned` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `role` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `HistoricalAvatar` DROP COLUMN `prompt`;

-- AlterTable
ALTER TABLE `User` DROP COLUMN `isBanned`,
    DROP COLUMN `role`;

-- AlterTable
ALTER TABLE `UserData` ADD COLUMN `isBanned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `role` ENUM('USER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'USER';
