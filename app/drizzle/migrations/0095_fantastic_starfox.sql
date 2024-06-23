ALTER TABLE `Bloodline` MODIFY COLUMN `rank` enum('D','C','B','A','S','H') NOT NULL;
ALTER TABLE `Jutsu` MODIFY COLUMN `jutsuRank` enum('D','C','B','A','S','H') NOT NULL DEFAULT 'D';
ALTER TABLE `Quest` MODIFY COLUMN `requiredRank` enum('D','C','B','A','S','H') NOT NULL DEFAULT 'D';
ALTER TABLE `UserData` ADD `missionsH` smallint unsigned DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` ADD `crimesH` smallint unsigned DEFAULT 0 NOT NULL;