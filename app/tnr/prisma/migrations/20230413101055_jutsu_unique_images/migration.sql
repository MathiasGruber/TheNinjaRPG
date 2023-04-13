/*
  Warnings:

  - A unique constraint covering the columns `[image]` on the table `Jutsu` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `Jutsu_image_key` ON `Jutsu`(`image`);
