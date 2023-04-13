/*
  Warnings:

  - A unique constraint covering the columns `[image]` on the table `Bloodline` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `image` to the `Bloodline` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `Bloodline` ADD COLUMN `image` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Bloodline_image_key` ON `Bloodline`(`image`);
