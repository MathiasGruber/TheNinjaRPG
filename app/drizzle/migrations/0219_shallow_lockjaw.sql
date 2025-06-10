ALTER TABLE `Quest` MODIFY COLUMN `questType` enum('mission','crime','event','exam','errand','tier','daily','achievement','story') NOT NULL;
ALTER TABLE `QuestHistory` MODIFY COLUMN `questType` enum('mission','crime','event','exam','errand','tier','daily','achievement','story') NOT NULL;
ALTER TABLE `Quest` ADD `prerequisiteQuestId` varchar(191);
CREATE INDEX `Quest_prerequisiteQuestId_idx` ON `Quest` (`prerequisiteQuestId`);