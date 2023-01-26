ALTER TABLE `UserData` MODIFY COLUMN `reputationPoints` int NOT NULL DEFAULT 5;
ALTER TABLE `UserData` MODIFY COLUMN `reputationPointsTotal` int NOT NULL DEFAULT 5;
CREATE INDEX `BattleAction_battleId_version_idx` ON `BattleAction` (`battleId`,`battleVersion`);