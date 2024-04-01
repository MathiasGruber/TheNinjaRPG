ALTER TABLE `VillageStructure` ADD `allyAccess` tinyint DEFAULT 1 NOT NULL;
UPDATE VillageStructure SET allyAccess = 0 WHERE name = 'Clan Hall';
UPDATE VillageStructure SET allyAccess = 0 WHERE name = 'ANBU';
UPDATE VillageStructure SET allyAccess = 0 WHERE name = 'Black Market';
UPDATE VillageStructure SET allyAccess = 0 WHERE name = 'Town Hall';