CREATE TABLE `DamageCalculation` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`userId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`state` json NOT NULL,
	`active` tinyint NOT NULL DEFAULT 1);

CREATE INDEX `DamageCalculation_userId_idx` ON `DamageCalculation` (`userId`);
CREATE INDEX `DamageCalculation_createdAt_idx` ON `DamageCalculation` (`createdAt`);