/*
  Warnings:

  - You are about to drop the column `slot` on the `UserItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `UserItem` DROP COLUMN `slot`,
    ADD COLUMN `equipped` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'LEFT_HAND', 'RIGHT_HAND', 'ITEM_1', 'ITEM_2', 'ITEM_3', 'ITEM_4', 'ITEM_5', 'ITEM_6', 'ITEM_7') NULL;
