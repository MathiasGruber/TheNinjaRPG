/*
  Warnings:

  - You are about to alter the column `status` on the `UserData` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Enum(EnumId(1))`.
  - You are about to drop the `MapSectors` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE `UserData` MODIFY `status` ENUM('AWAKE', 'TRAVEL', 'BATTLE') NOT NULL DEFAULT 'AWAKE';

-- DropTable
DROP TABLE `MapSectors`;
