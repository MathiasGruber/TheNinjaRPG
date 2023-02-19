/*
  Warnings:

  - You are about to drop the column `content` on the `BugReport` table. All the data in the column will be lost.
  - Added the required column `description` to the `BugReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `system` to the `BugReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `BugReport` DROP COLUMN `content`,
    ADD COLUMN `description` TEXT NOT NULL,
    ADD COLUMN `system` VARCHAR(191) NOT NULL;
