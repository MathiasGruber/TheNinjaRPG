/*
  Warnings:

  - You are about to drop the column `attackType` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `element1` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `element2` on the `Jutsu` table. All the data in the column will be lost.
  - You are about to drop the column `element3` on the `Jutsu` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Jutsu` DROP COLUMN `attackType`,
    DROP COLUMN `element1`,
    DROP COLUMN `element2`,
    DROP COLUMN `element3`;
