CREATE TABLE `SupportReview` (
	`id` varchar(191) NOT NULL,
	`apiRoute` varchar(191) NOT NULL,
	`chatHistory` json NOT NULL,
	`userId` varchar(191) NOT NULL,
	`sentiment` enum('POSITIVE','NEGATIVE','NEUTRAL') NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `SupportReview_id` PRIMARY KEY(`id`)
);

ALTER TABLE `UserData` MODIFY COLUMN `primaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light','Boil','None');
ALTER TABLE `UserData` MODIFY COLUMN `secondaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light','Boil','None');
ALTER TABLE `UserData` ADD `openaiCalls` int DEFAULT 0 NOT NULL;