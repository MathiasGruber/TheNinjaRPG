/*
  Warnings:

  - The values [LEFT_RING,RIGHT_RING,LEFT_HAND,RIGHT_HAND,ITEM_1,ITEM_2,ITEM_3,ITEM_4,ITEM_5] on the enum `Item_slot` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `equipped` on the `UserItem` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Item` MODIFY `slot` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'HAND', 'ITEM') NOT NULL;

-- AlterTable
ALTER TABLE `UserItem` DROP COLUMN `equipped`,
    ADD COLUMN `slot` ENUM('HEAD', 'CHEST', 'LEGS', 'FEET', 'LEFT_HAND', 'RIGHT_HAND', 'ITEM_1', 'ITEM_2', 'ITEM_3', 'ITEM_4', 'ITEM_5', 'ITEM_6', 'ITEM_7') NULL;
