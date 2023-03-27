/*
  Warnings:

  - You are about to drop the column `latitude` on the `Village` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Village` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Village` DROP COLUMN `latitude`,
    DROP COLUMN `longitude`;
