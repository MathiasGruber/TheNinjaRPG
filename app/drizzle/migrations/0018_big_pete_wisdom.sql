TRUNCATE TABLE `DataBattleAction`;
DROP INDEX `DataBattleActions_type` ON `DataBattleAction`;
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING') NOT NULL;
ALTER TABLE `DataBattleAction` ADD `type` enum('jutsu','item','bloodline','basic') NOT NULL;
CREATE INDEX `DataBattleActions_type` ON `DataBattleAction` (`type`);