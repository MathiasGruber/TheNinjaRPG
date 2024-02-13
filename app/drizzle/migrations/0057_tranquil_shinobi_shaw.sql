ALTER TABLE `UserData` MODIFY COLUMN `primaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','None');
ALTER TABLE `UserData` MODIFY COLUMN `secondaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','None');
ALTER TABLE `VillageStructure` ADD `longitude` tinyint DEFAULT 10 NOT NULL;
ALTER TABLE `VillageStructure` ADD `latitude` tinyint DEFAULT 10 NOT NULL;
ALTER TABLE `VillageStructure` ADD `hasPage` tinyint DEFAULT 0 NOT NULL;