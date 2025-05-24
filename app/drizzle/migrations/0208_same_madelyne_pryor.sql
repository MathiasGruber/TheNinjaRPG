CREATE TABLE `Sector` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sector` smallint NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `Sector_id` PRIMARY KEY(`id`),
	CONSTRAINT `Sector_sector_key` UNIQUE(`sector`)
);

CREATE TABLE `War` (
	`id` varchar(191) NOT NULL,
	`attackerVillageId` varchar(191) NOT NULL,
	`defenderVillageId` varchar(191) NOT NULL,
	`startedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`endedAt` datetime(3),
	`status` enum('ACTIVE','ATTACKER_VICTORY','DEFENDER_VICTORY','DRAW') NOT NULL,
	`type` enum('VILLAGE_WAR','SECTOR_WAR','FACTION_RAID') NOT NULL,
	`sector` smallint NOT NULL DEFAULT 0,
	`shrineHp` smallint NOT NULL DEFAULT 3000,
	`dailyTokenReduction` int NOT NULL DEFAULT 1000,
	`lastTokenReductionAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`targetStructureRoute` varchar(191) NOT NULL DEFAULT '/townhall',
	CONSTRAINT `War_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarAlly` (
	`id` varchar(191) NOT NULL,
	`warId` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`supportVillageId` varchar(191) NOT NULL,
	`tokensPaid` int NOT NULL,
	`joinedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `WarAlly_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarKill` (
	`id` varchar(191) NOT NULL,
	`warId` varchar(191) NOT NULL,
	`killerId` varchar(191) NOT NULL,
	`victimId` varchar(191) NOT NULL,
	`killerVillageId` varchar(191) NOT NULL,
	`victimVillageId` varchar(191) NOT NULL,
	`sector` smallint NOT NULL DEFAULT 1337,
	`shrineHpChange` smallint NOT NULL DEFAULT 1337,
	`townhallHpChange` smallint NOT NULL DEFAULT 1337,
	`killedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `WarKill_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Battle` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_AI','KAGE_PVP','CLAN_CHALLENGE','CLAN_BATTLE','SHRINE_WAR','TOURNAMENT','QUEST','VILLAGE_PROTECTOR','TRAINING') NOT NULL;
ALTER TABLE `BattleHistory` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_AI','KAGE_PVP','CLAN_CHALLENGE','CLAN_BATTLE','SHRINE_WAR','TOURNAMENT','QUEST','VILLAGE_PROTECTOR','TRAINING');
ALTER TABLE `DataBattleAction` MODIFY COLUMN `battleType` enum('ARENA','COMBAT','SPARRING','KAGE_AI','KAGE_PVP','CLAN_CHALLENGE','CLAN_BATTLE','SHRINE_WAR','TOURNAMENT','QUEST','VILLAGE_PROTECTOR','TRAINING') NOT NULL;
ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU','CLAN','MARRIAGE','KAGE','WAR_ALLY') NOT NULL;
ALTER TABLE `UserRequest` ADD `value` int DEFAULT 0;
ALTER TABLE `UserRequest` ADD `relatedId` varchar(191);
ALTER TABLE `Village` ADD `warExhaustionEndedAt` datetime(3);
ALTER TABLE `Village` ADD `lastWarEndedAt` datetime(3);
ALTER TABLE `VillageStructure` ADD `lastUpgradedAt` datetime(3);
CREATE INDEX `WarAlly_warId_idx` ON `WarAlly` (`warId`);
CREATE INDEX `WarAlly_villageId_idx` ON `WarAlly` (`villageId`);
CREATE INDEX `WarKill_warId_idx` ON `WarKill` (`warId`);
CREATE INDEX `WarKill_killerId_idx` ON `WarKill` (`killerId`);
CREATE INDEX `WarKill_victimId_idx` ON `WarKill` (`victimId`);
CREATE INDEX `WarKill_killerVillageId_idx` ON `WarKill` (`killerVillageId`);
CREATE INDEX `WarKill_victimVillageId_idx` ON `WarKill` (`victimVillageId`);
CREATE INDEX `BattleHistory_createdAt_idx` ON `BattleHistory` (`createdAt`);
CREATE INDEX `BattleHistory_battleType_idx` ON `BattleHistory` (`battleType`);

-- Custom SQL migration file, put your code below! --

INSERT INTO Sector (id, sector, villageId, createdAt)
SELECT 
    ROW_NUMBER() OVER () + (SELECT COALESCE(MAX(id), 0) FROM Sector),
    v.sector as sector,
    v.id as villageId,
    COALESCE(v.createdAt, CURRENT_TIMESTAMP(3)) as createdAt
FROM Village v
WHERE NOT EXISTS (
    SELECT 1 
    FROM Sector s 
    WHERE s.villageId = v.id
);

UPDATE VillageStructure SET `villageDefencePerLvl` = 0 WHERE route = '/anbu';
UPDATE VillageStructure SET `villageDefencePerLvl` = 0 WHERE route = '/clanhall';