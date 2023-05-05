/*
  Warnings:

  - You are about to drop the column `pvp_experience` on the `UserData` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `UserData` DROP COLUMN `pvp_experience`,
    MODIFY `status` ENUM('AWAKE', 'HOSPITALIZED', 'TRAVEL', 'BATTLE') NOT NULL DEFAULT 'AWAKE';
