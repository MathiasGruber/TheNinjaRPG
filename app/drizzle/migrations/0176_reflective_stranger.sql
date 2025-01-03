CREATE TABLE `ReputationAward` (
	`id` varchar(191) NOT NULL,
	`awardedById` varchar(191) NOT NULL,
	`receiverId` varchar(191) NOT NULL,
	`amount` float NOT NULL,
	`reason` text NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ReputationAward_id` PRIMARY KEY(`id`)
);

ALTER TABLE `backgroundSchema` MODIFY COLUMN `id` varchar(191) NOT NULL DEFAULT (UUID());
CREATE INDEX `ReputationAward_awardedById_idx` ON `ReputationAward` (`awardedById`);
CREATE INDEX `ReputationAward_receiverId_idx` ON `ReputationAward` (`receiverId`);
CREATE INDEX `ReputationAward_createdAt_idx` ON `ReputationAward` (`createdAt`);