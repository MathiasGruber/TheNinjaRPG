/*
  Warnings:

  - Added the required column `federalStatus` to the `PaypalSubscription` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `PaypalSubscription` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `PaypalSubscription` ADD COLUMN `federalStatus` ENUM('NONE', 'NORMAL', 'SILVER', 'GOLD') NOT NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL;
