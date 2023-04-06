/*
  Warnings:

  - You are about to drop the column `attempts` on the `HistoricalAvatar` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[avatar]` on the table `HistoricalAvatar` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `HistoricalAvatar` DROP COLUMN `attempts`,
    ADD COLUMN `prompt` VARCHAR(191) NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX `HistoricalAvatar_avatar_key` ON `HistoricalAvatar`(`avatar`);

-- CreateIndex
CREATE INDEX `HistoricalAvatar_avatar_idx` ON `HistoricalAvatar`(`avatar`);
