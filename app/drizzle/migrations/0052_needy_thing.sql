ALTER TABLE `UserData` MODIFY COLUMN `reputationPoints` float NOT NULL DEFAULT 5;
ALTER TABLE `UserData` MODIFY COLUMN `reputationPointsTotal` float NOT NULL DEFAULT 5;
ALTER TABLE `UserData` ADD `villagePrestige` float DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` DROP COLUMN `popularityPoints`;
ALTER TABLE `UserData` DROP COLUMN `popularityPointsTotal`;