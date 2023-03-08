/*
  Warnings:

  - A unique constraint covering the columns `[attribute,userId]` on the table `UserAttribute` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `userId_attribute` ON `UserAttribute`(`attribute`, `userId`);
