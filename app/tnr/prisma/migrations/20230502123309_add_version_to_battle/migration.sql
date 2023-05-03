/*
  Warnings:

  - A unique constraint covering the columns `[id,version]` on the table `Battle` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `Battle` ADD COLUMN `version` INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE UNIQUE INDEX `Battle_id_version_key` ON `Battle`(`id`, `version`);
