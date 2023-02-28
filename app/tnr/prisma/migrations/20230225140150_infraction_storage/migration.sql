/*
  Warnings:

  - You are about to alter the column `infractionContent` on the `UserReport` table. The data in that column could be lost. The data in that column will be cast from `Text` to `Json`.

*/
-- AlterTable
ALTER TABLE `UserReport` MODIFY `infractionContent` JSON NOT NULL;
