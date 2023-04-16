/*
  Warnings:

  - The values [UNCOMMON] on the enum `Item_rarity` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `rarity` ENUM('COMMON', 'RARE', 'EPIC', 'LEGENDARY') NOT NULL;
