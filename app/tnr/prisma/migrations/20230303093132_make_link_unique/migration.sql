/*
  Warnings:

  - A unique constraint covering the columns `[conversationId]` on the table `BugReport` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `BugReport_conversationId_key` ON `BugReport`(`conversationId`);
