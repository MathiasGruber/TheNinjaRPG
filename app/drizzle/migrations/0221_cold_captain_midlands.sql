DROP INDEX `DataBattleActions_contentId_idx` ON `DataBattleAction`;
DROP INDEX `DataBattleActions_type` ON `DataBattleAction`;
DROP INDEX `DataBattleActions_battleWon` ON `DataBattleAction`;
DROP INDEX `DataBattleActions_battleType` ON `DataBattleAction`;
ALTER TABLE `DataBattleAction` ADD `count` int DEFAULT 1 NOT NULL;
ALTER TABLE `DataBattleAction` ADD CONSTRAINT `uniqueContentId` UNIQUE(`type`,`contentId`,`battleType`,`battleWon`);