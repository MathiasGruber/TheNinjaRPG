CREATE TABLE `UserCookingJob` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`experience` int NOT NULL,
	`finishesAt` datetime(3) NOT NULL,
	CONSTRAINT `UserCookingJob_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Item` MODIFY COLUMN `itemType` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','MEAL','KEYSTONE','CRYSTAL','FURNITURE','OTHER') NOT NULL;
ALTER TABLE `Item` MODIFY COLUMN `crystalTargetTypes` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','MEAL','KEYSTONE','CRYSTAL','FURNITURE','OTHER');
ALTER TABLE `UserRaidBuff` MODIFY COLUMN `questId` varchar(191);
ALTER TABLE `Item` ADD `cookingMinLevel` int DEFAULT 1 NOT NULL;
ALTER TABLE `Item` ADD `cookingTimeSeconds` int DEFAULT 60 NOT NULL;
ALTER TABLE `Item` ADD `cookingOutputQuantity` int DEFAULT 1 NOT NULL;
ALTER TABLE `Item` ADD `cookingExperience` int DEFAULT 0 NOT NULL;
ALTER TABLE `Item` ADD `mealDurationSeconds` int DEFAULT 60 NOT NULL;
ALTER TABLE `UserData` ADD `cookingExperience` int DEFAULT 0 NOT NULL;
ALTER TABLE `UserRaidBuff` ADD `itemId` varchar(191);
CREATE INDEX `UserCookingJob_userId_finishesAt_idx` ON `UserCookingJob` (`userId`,`finishesAt`);