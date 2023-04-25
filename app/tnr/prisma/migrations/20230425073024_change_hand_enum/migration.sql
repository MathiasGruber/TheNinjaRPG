/*
  Warnings:

  - The values [LEFT_HAND,RIGHT_HAND] on the enum `UserItem_equipped` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterTable
ALTER TABLE `UserItem` MODIFY `equipped` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'HAND_1', 'HAND_2', 'ITEM_1', 'ITEM_2', 'ITEM_3', 'ITEM_4', 'ITEM_5', 'ITEM_6', 'ITEM_7') NULL;
