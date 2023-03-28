/*
  Warnings:

  - A unique constraint covering the columns `[name,villageId]` on the table `VillageStructures` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX `VillageStructures_name_villageId_key` ON `VillageStructures`(`name`, `villageId`);
