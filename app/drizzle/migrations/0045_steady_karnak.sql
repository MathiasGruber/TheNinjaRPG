ALTER TABLE `Quest` MODIFY COLUMN `questType` enum('mission','crime','event','exam','errand','tier','daily','achievement') NOT NULL;
ALTER TABLE `QuestHistory` MODIFY COLUMN `questType` enum('mission','crime','event','exam','errand','tier','daily','achievement') NOT NULL;
ALTER TABLE `UserData` ADD `nRecruited` int DEFAULT 0 NOT NULL;