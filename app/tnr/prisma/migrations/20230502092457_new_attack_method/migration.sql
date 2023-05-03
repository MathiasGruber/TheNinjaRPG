/*
  Warnings:

  - The values [AOE_CONE_SHOOT] on the enum `Item_method` will be removed. If these variants are still used in the database, this will fail.
  - The values [AOE_CONE_SHOOT] on the enum `Item_method` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `method` ENUM('SINGLE', 'ALL', 'AOE_CIRCLE_SPAWN', 'AOE_LINE_SHOOT', 'AOE_CIRCLE_SHOOT', 'AOE_SPIRAL_SHOOT') NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE `Jutsu` MODIFY `method` ENUM('SINGLE', 'ALL', 'AOE_CIRCLE_SPAWN', 'AOE_LINE_SHOOT', 'AOE_CIRCLE_SHOOT', 'AOE_SPIRAL_SHOOT') NOT NULL DEFAULT 'SINGLE';
