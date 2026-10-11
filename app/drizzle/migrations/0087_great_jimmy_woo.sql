CREATE TABLE `UserPet` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`name` varchar(40) NOT NULL,
	`speciesIndex` tinyint unsigned NOT NULL,
	`paletteIndex` tinyint unsigned NOT NULL,
	`characteristicIndex` tinyint unsigned NOT NULL,
	`auraIndex` tinyint unsigned NOT NULL,
	`rank` tinyint unsigned NOT NULL DEFAULT 1,
	`experience` double NOT NULL DEFAULT 0,
	`offence` double NOT NULL DEFAULT 10,
	`defence` double NOT NULL DEFAULT 10,
	`strength` double NOT NULL DEFAULT 10,
	`speed` double NOT NULL DEFAULT 10,
	`intelligence` double NOT NULL DEFAULT 10,
	`willpower` double NOT NULL DEFAULT 10,
	`avatar` varchar(191),
	`avatarFacing` enum('left','right') NOT NULL DEFAULT 'left',
	`battleEnabled` boolean NOT NULL DEFAULT true,
	`spawnPosition` enum('BEHIND','LEFT','RIGHT','FRONT') NOT NULL DEFAULT 'BEHIND',
	`aiRules` json NOT NULL DEFAULT ('[]'),
	`includeDefaultRules` boolean NOT NULL DEFAULT true,
	`generationStatus` enum('PENDING','GENERATING','READY','FAILED') NOT NULL DEFAULT 'PENDING',
	`generationToken` varchar(191),
	`generationStartedAt` datetime(3),
	`generationAttempts` tinyint unsigned NOT NULL DEFAULT 0,
	`generationDay` varchar(10),
	`artRank` tinyint unsigned NOT NULL DEFAULT 0,
	`revision` int unsigned NOT NULL DEFAULT 0,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserPet_id` PRIMARY KEY(`id`),
	CONSTRAINT `UserPet_userId_idx` UNIQUE(`userId`)
);

ALTER TABLE `UserData` ADD `petExperience` double DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` ADD `petAcquisitions` int unsigned DEFAULT 0 NOT NULL;
INSERT INTO `VillageStructure` (`id`, `name`, `route`, `image`, `villageId`, `longitude`, `latitude`, `hasPage`, `allyAccess`, `maxLevel`)
SELECT 'wake-bondkeeper-sanctuary', 'Bondkeeper Sanctuary', '/pets', '/bondkeeper-sanctuary.svg', `id`, 3, 6, 1, 1, 1
FROM `Village` WHERE `name` = 'Wake Island'
ON DUPLICATE KEY UPDATE `route` = '/pets', `image` = '/bondkeeper-sanctuary.svg';
