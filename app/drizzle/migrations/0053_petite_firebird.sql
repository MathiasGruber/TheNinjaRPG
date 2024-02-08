CREATE TABLE `VillageAlliance` (
	`id` varchar(191) NOT NULL,
	`villageIdA` varchar(191) NOT NULL,
	`villageIdB` varchar(191) NOT NULL,
	`status` enum('NEUTRAL','ALLY','ENEMY') NOT NULL,
	`updatedAt` datetime(3),
	`createdAt` datetime(3),
	CONSTRAINT `VillageAlliance_id` PRIMARY KEY(`id`)
);

CREATE INDEX `VillageAlliance_villageIdA_idx` ON `VillageAlliance` (`villageIdA`);
CREATE INDEX `VillageAlliance_villageIdB_idx` ON `VillageAlliance` (`villageIdB`);
CREATE INDEX `VillageAlliance_status_idx` ON `VillageAlliance` (`status`);