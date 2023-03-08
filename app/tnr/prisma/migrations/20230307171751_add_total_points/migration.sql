-- AlterTable
ALTER TABLE `UserData` ADD COLUMN `popularity_points_total` INTEGER NOT NULL DEFAULT 6,
    ADD COLUMN `reputation_points_total` INTEGER NOT NULL DEFAULT 0;
