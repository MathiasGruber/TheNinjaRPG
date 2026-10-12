ALTER TABLE `Village` MODIFY COLUMN `type` enum('VILLAGE','OUTLAW','SAFEZONE','HIDEOUT','TOWN','STRONGHOLD') NOT NULL DEFAULT 'VILLAGE';
UPDATE `Village` SET `type` = 'STRONGHOLD' WHERE `type` = 'TOWN';
ALTER TABLE `Village` MODIFY COLUMN `type` enum('VILLAGE','OUTLAW','SAFEZONE','HIDEOUT','STRONGHOLD') NOT NULL DEFAULT 'VILLAGE';
ALTER TABLE `Village` ADD `belowMemberMinimumSince` datetime(3);
ALTER TABLE `Village` ADD `raidRetryCooldowns` json DEFAULT ('{}') NOT NULL;
ALTER TABLE `VillageStructure` ADD `raidBoostExpiresAt` datetime(3);
ALTER TABLE `VillageStructure` ADD `raidProtectedUntil` datetime(3);
UPDATE `Village` SET `belowMemberMinimumSince` = CURRENT_TIMESTAMP(3)
WHERE `type` = 'STRONGHOLD' AND (SELECT COUNT(*) FROM `UserData` INNER JOIN `Clan` ON `Clan`.`id` = `UserData`.`clanId` WHERE `Clan`.`villageId` = `Village`.`id` AND `UserData`.`isAi` = 0) < 30;
UPDATE `War` SET
  `attackerWarHealth` = LEAST(2000, ROUND(`attackerWarHealth` * 2000 / GREATEST(`attackerWarHealthMax`, 1))),
  `defenderWarHealth` = LEAST(2000, ROUND(`defenderWarHealth` * 2000 / GREATEST(`defenderWarHealthMax`, 1))),
  `attackerWarHealthMax` = 2000, `defenderWarHealthMax` = 2000
WHERE `type` = 'WAR_RAID' AND `status` = 'ACTIVE';
