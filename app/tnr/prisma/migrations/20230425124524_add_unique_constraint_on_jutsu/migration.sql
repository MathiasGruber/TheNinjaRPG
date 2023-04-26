/*
  Warnings:

  - A unique constraint covering the columns `[userId,jutsuId]` on the table `UserJutsu` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `UserJutsu_userId_jutsuId_key` ON `UserJutsu`(`userId`, `jutsuId`);
