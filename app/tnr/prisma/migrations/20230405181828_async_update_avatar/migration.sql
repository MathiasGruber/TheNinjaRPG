/*
  Warnings:

  - A unique constraint covering the columns `[replicateId]` on the table `HistoricalAvatar` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `HistoricalAvatar` ADD COLUMN `replicateId` VARCHAR(191) NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `avatar` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `HistoricalAvatar_replicateId_key` ON `HistoricalAvatar`(`replicateId`);

-- CreateIndex
CREATE INDEX `HistoricalAvatar_replicateId_idx` ON `HistoricalAvatar`(`replicateId`);
