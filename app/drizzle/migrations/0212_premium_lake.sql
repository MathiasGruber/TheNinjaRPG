CREATE TABLE `HistoricalIp` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`ip` varchar(191) NOT NULL,
	`usedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `HistoricalIp_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Bloodline` DROP INDEX `Bloodline_image_key`;
ALTER TABLE `Jutsu` DROP INDEX `Jutsu_image_key`;
CREATE INDEX `Bloodline_image_key` ON `Bloodline` (`image`);
CREATE INDEX `Jutsu_image_key` ON `Jutsu` (`image`);
