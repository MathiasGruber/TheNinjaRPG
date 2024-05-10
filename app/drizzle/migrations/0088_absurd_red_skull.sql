ALTER TABLE `Village` MODIFY COLUMN `isOutlawFaction` boolean NOT NULL;
ALTER TABLE `Village` MODIFY COLUMN `isOutlawFaction` boolean NOT NULL DEFAULT false;
ALTER TABLE `UserData` ADD `isOutlaw` boolean DEFAULT false NOT NULL;
ALTER TABLE `VillageStructure` ADD `route` varchar(191) DEFAULT '' NOT NULL;

UPDATE `VillageStructure` SET `route` = '/missionhall' WHERE `name` = 'Mission Hall';
UPDATE `VillageStructure` SET `route` = '/traininggrounds' WHERE `name` = 'Training Grounds';
UPDATE `VillageStructure` SET `route` = '/clanhall' WHERE `name` = 'Clan Hall';
UPDATE `VillageStructure` SET `route` = '/townhall' WHERE `name` = 'Town Hall';
UPDATE `VillageStructure` SET `route` = '/battlearena' WHERE `name` = 'Battle Arena';
UPDATE `VillageStructure` SET `route` = '/missionhall' WHERE `name` = 'Mission Hall';
UPDATE `VillageStructure` SET `route` = '/bank' WHERE `name` = 'Bank';
UPDATE `VillageStructure` SET `route` = '/itemshop' WHERE `name` = 'Item shop';
UPDATE `VillageStructure` SET `route` = '/hospital' WHERE `name` = 'Hospital';
UPDATE `VillageStructure` SET `route` = '/anbu' WHERE `name` = 'ANBU';
UPDATE `VillageStructure` SET `route` = '/ramenshop' WHERE `name` = 'Ramen Shop';
UPDATE `VillageStructure` SET `route` = '/blackmarket' WHERE `name` = 'Black Market';
UPDATE `VillageStructure` SET `route` = '/home' WHERE `name` = 'Home';