/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `ForumBoard` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `ForumBoard_name_key` ON `ForumBoard`(`name`);
