/*
  Warnings:

  - A unique constraint covering the columns `[title]` on the table `Conversation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Conversation` MODIFY `title` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Conversation_title_key` ON `Conversation`(`title`);
