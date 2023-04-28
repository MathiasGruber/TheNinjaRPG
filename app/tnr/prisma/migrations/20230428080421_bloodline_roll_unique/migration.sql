/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `BloodlineRolls` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX `BloodlineRolls_userId_bloodlineId_key` ON `BloodlineRolls`;

-- CreateIndex
CREATE UNIQUE INDEX `BloodlineRolls_userId_key` ON `BloodlineRolls`(`userId`);
