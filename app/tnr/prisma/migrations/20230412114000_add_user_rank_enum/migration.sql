/*
  Warnings:

  - You are about to drop the column `rank` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to alter the column `rank` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(8))`.
  - Added the required column `level` to the `Jutsu` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requiredRank` to the `Jutsu` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Jutsu` DROP COLUMN `rank`,
    ADD COLUMN `level` ENUM('D', 'C', 'B', 'A', 'S') NOT NULL,
    ADD COLUMN `requiredRank` ENUM('STUDENT', 'GENIN', 'CHUNIN', 'JONIN', 'COMMANDER', 'ELDER') NOT NULL;

-- AlterTable
ALTER TABLE `UserData` MODIFY `rank` ENUM('STUDENT', 'GENIN', 'CHUNIN', 'JONIN', 'COMMANDER', 'ELDER') NOT NULL DEFAULT 'STUDENT';
