CREATE TABLE `AnbuSquad` (
	`id` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`leaderId` varchar(191) NOT NULL,
	`villageId` varchar(191) NOT NULL,
	`pvpActivity` int NOT NULL DEFAULT 0,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `AnbuSquad_id` PRIMARY KEY(`id`),
	CONSTRAINT `AnbuSquad_name_key` UNIQUE(`name`)
);

ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU') NOT NULL;
ALTER TABLE `UserData` ADD `anbuId` varchar(191);
CREATE INDEX `AnbuSquad_leaderId_idx` ON `AnbuSquad` (`leaderId`);
CREATE INDEX `AnbuSquad_villageId_idx` ON `AnbuSquad` (`villageId`);

UPDATE VillageStructure SET level = 1 WHERE name = 'ANBU'