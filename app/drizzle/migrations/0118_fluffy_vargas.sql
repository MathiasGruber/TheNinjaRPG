ALTER TABLE `Quest` RENAME COLUMN `requiredRank` TO `questRank`;
DROP INDEX `Quest_requiredRank_idx` ON `Quest`;
ALTER TABLE `Quest` MODIFY COLUMN `consecutiveObjectives` boolean NOT NULL DEFAULT true;
ALTER TABLE `Quest` ADD `maxLevel` int DEFAULT 100 NOT NULL;
CREATE INDEX `Quest_questRank_idx` ON `Quest` (`questRank`);