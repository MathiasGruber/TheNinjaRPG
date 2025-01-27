CREATE TABLE `War` (
       `id` varchar(191) NOT NULL,
       `attackerVillageId` varchar(191) NOT NULL,
       `defenderVillageId` varchar(191) NOT NULL,
       `startedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `endedAt` datetime(3),
       `status` enum('ACTIVE','ATTACKER_VICTORY','DEFENDER_VICTORY','SURRENDERED') NOT NULL,
       `dailyTokenReduction` int NOT NULL DEFAULT 1000,
       `lastTokenReductionAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `War_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarFaction` (
       `id` varchar(191) NOT NULL,
       `warId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `tokensPaid` int NOT NULL,
       `joinedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `WarFaction_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarKill` (
       `id` varchar(191) NOT NULL,
       `warId` varchar(191) NOT NULL,
       `killerId` varchar(191) NOT NULL,
       `victimId` varchar(191) NOT NULL,
       `killerVillageId` varchar(191) NOT NULL,
       `victimVillageId` varchar(191) NOT NULL,
       `killedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `WarKill_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WarStat` (
       `id` varchar(191) NOT NULL,
       `warId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `townHallHp` int NOT NULL DEFAULT 5000,
       `lastUpdatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `WarStat_id` PRIMARY KEY(`id`)
);

CREATE INDEX `War_attackerVillageId_idx` ON `War` (`attackerVillageId`);
CREATE INDEX `War_defenderVillageId_idx` ON `War` (`defenderVillageId`);
CREATE INDEX `War_status_idx` ON `War` (`status`);
CREATE INDEX `WarFaction_warId_idx` ON `WarFaction` (`warId`);
CREATE INDEX `WarFaction_villageId_idx` ON `WarFaction` (`villageId`);
CREATE INDEX `WarKill_warId_idx` ON `WarKill` (`warId`);
CREATE INDEX `WarKill_killerId_idx` ON `WarKill` (`killerId`);
CREATE INDEX `WarKill_victimId_idx` ON `WarKill` (`victimId`);
CREATE INDEX `WarKill_killerVillageId_idx` ON `WarKill` (`killerVillageId`);
CREATE INDEX `WarKill_victimVillageId_idx` ON `WarKill` (`victimVillageId`);
CREATE INDEX `WarStat_warId_idx` ON `WarStat` (`warId`);
CREATE INDEX `WarStat_villageId_idx` ON `WarStat` (`villageId`);
