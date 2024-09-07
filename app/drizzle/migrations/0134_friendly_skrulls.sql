ALTER TABLE `GameSetting` MODIFY COLUMN `value` int NOT NULL;
ALTER TABLE `UserData` MODIFY COLUMN `primaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light','None');
ALTER TABLE `UserData` MODIFY COLUMN `secondaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light','None');
CREATE INDEX `BattleAction_createdAt_idx` ON `BattleAction` (`createdAt`);
CREATE INDEX `DataBattleActions_battleType` ON `DataBattleAction` (`battleType`);
CREATE INDEX `DataBattleActions_createdAt` ON `DataBattleAction` (`createdAt`);