ALTER TABLE `VillageStructure` MODIFY COLUMN `baseCost` int NOT NULL DEFAULT 10000;
ALTER TABLE `Village` ADD `populationCount` int DEFAULT 0 NOT NULL;