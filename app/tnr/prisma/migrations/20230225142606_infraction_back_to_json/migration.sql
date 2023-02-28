/*
  Warnings:

  - You are about to drop the column `infractionContent` on the `UserReport` table. All the data in the column will be lost.
  - You are about to drop the column `infractionScreenshot` on the `UserReport` table. All the data in the column will be lost.
  - Added the required column `infraction` to the `UserReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `UserReport` DROP COLUMN `infractionContent`,
    DROP COLUMN `infractionScreenshot`,
    ADD COLUMN `infraction` JSON NOT NULL;
