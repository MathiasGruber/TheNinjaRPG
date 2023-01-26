/*
  Warnings:

  - Added the required column `gender` to the `UserStats` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `UserStats` ADD COLUMN `gender` ENUM('Female', 'Male') NOT NULL;
