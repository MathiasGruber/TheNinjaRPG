ALTER TABLE `UserData` ADD `pvpExperience` float DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` ADD `pvpExperienceDecayAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `UserData` ADD `weeklyPvpKills` int unsigned DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` ADD `weeklyPvpKillsAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
CREATE INDEX `UserData_pvpExperienceAverage_idx` ON `UserData` (`isAi`,`pvpExperience`);
ALTER TABLE `UserData` DROP COLUMN `pvpActivity`;