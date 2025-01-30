CREATE TABLE `VillageDefense` (
       `id` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `type` enum('TRAINING_GROUND','RAMEN_SHOP','MISSION_HALL','ITEM_SHOP','HOSPITAL','BATTLE_ARENA','BANK') NOT NULL,
       `defenseLevel` tinyint NOT NULL DEFAULT 1,
       `hp` int NOT NULL DEFAULT 1000,
       `lastUpdatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `VillageDefense_id` PRIMARY KEY(`id`),
       CONSTRAINT `VillageDefense_villageId_type_key` UNIQUE(`villageId`,`type`)
);

CREATE TABLE `VillageDefenseWall` (
       `id` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `level` tinyint NOT NULL DEFAULT 1,
       `lastUpdatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `VillageDefenseWall_id` PRIMARY KEY(`id`),
       CONSTRAINT `VillageDefenseWall_villageId_key` UNIQUE(`villageId`)
);

CREATE TABLE `WarDefenseTarget` (
       `id` varchar(191) NOT NULL,
       `warId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `structureType` enum('TRAINING_GROUND','RAMEN_SHOP','MISSION_HALL','ITEM_SHOP','HOSPITAL','BATTLE_ARENA','BANK') NOT NULL,
       `lastUpdatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `WarDefenseTarget_id` PRIMARY KEY(`id`),
       CONSTRAINT `WarDefenseTarget_warId_villageId_type_key` UNIQUE(`warId`,`villageId`,`structureType`)
);
