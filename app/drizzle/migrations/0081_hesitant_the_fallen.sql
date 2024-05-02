ALTER TABLE `Item` ADD `reputationCost` int DEFAULT 0 NOT NULL;

UPDATE VillageStructure SET level = 1 WHERE name = 'Black Market';