/*
  Warnings:

  - The values [SELF,OPPONENT] on the enum `Item_target` will be removed. If these variants are still used in the database, this will fail.
  - The values [SELF,OPPONENT] on the enum `Item_target` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Item` ADD COLUMN `method` ENUM('SINGLE', 'AOE_CIRCLE', 'AOE_LINE', 'AOE_CONE', 'AOE_EMPTY_CIRCLE', 'AOE_STAR') NOT NULL DEFAULT 'SINGLE',
    MODIFY `target` ENUM('CHARACTER', 'GROUND') NOT NULL;

-- AlterTable
ALTER TABLE `Jutsu` ADD COLUMN `method` ENUM('SINGLE', 'AOE_CIRCLE', 'AOE_LINE', 'AOE_CONE', 'AOE_EMPTY_CIRCLE', 'AOE_STAR') NOT NULL DEFAULT 'SINGLE',
    MODIFY `target` ENUM('CHARACTER', 'GROUND') NOT NULL;
