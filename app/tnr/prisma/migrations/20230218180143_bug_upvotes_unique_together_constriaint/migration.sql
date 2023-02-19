/*
  Warnings:

  - A unique constraint covering the columns `[bugId,userId]` on the table `BugUpVotes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `BugUpVotes_bugId_userId_key` ON `BugUpVotes`(`bugId`, `userId`);
