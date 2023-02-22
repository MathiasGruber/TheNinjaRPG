/*
  Warnings:

  - You are about to drop the column `resolution` on the `UserReport` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `UserReport` DROP COLUMN `resolution`,
    ADD COLUMN `is_resolved` BOOLEAN NOT NULL DEFAULT false;
