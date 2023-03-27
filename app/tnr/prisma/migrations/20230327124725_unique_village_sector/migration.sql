/*
  Warnings:

  - A unique constraint covering the columns `[sector]` on the table `Village` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Village_sector_key` ON `Village`(`sector`);
