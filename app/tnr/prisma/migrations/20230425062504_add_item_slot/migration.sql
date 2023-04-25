/*
  Warnings:

  - The values [HANDS,NECK,RING,MAINHAND,OFFHAND,BACKPACK] on the enum `Item_slot` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `slot` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'LEFT_RING', 'RIGHT_RING', 'LEFT_HAND', 'RIGHT_HAND', 'ITEM_1', 'ITEM_2', 'ITEM_3', 'ITEM_4', 'ITEM_5') NOT NULL;
