CREATE TABLE `BattleHistory` (
	`id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`battleId` varchar(191) NOT NULL,
	`attackedId` varchar(191) NOT NULL,
	`defenderId` varchar(191) NOT NULL);

ALTER TABLE `Battle` ADD `rewardScaling` double DEFAULT 1 NOT NULL;
CREATE INDEX `BattleHistory_battleId_idx` ON `BattleHistory` (`battleId`);
CREATE INDEX `BattleHistory_attackedId_idx` ON `BattleHistory` (`attackedId`);
CREATE INDEX `BattleHistory_defenderId_idx` ON `BattleHistory` (`defenderId`);