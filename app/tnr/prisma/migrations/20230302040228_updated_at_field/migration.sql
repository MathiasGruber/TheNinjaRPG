/*
  Warnings:

  - Added the required column `updatedAt` to the `ForumBoard` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `ForumThread` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `ForumBoard` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `ForumThread` ADD COLUMN `isPinned` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `nPosts` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;
