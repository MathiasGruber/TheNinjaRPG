/*
  Warnings:

  - You are about to drop the column `infraction` on the `UserReport` table. All the data in the column will be lost.
  - Added the required column `infractionContent` to the `UserReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `infractionScreenshot` to the `UserReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `UserReport` DROP COLUMN `infraction`,
    ADD COLUMN `infractionContent` TEXT NOT NULL,
    ADD COLUMN `infractionScreenshot` VARCHAR(191) NOT NULL;
