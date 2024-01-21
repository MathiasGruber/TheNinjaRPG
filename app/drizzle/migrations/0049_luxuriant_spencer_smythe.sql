CREATE TABLE `Badge` (
	`id` varchar(191) NOT NULL,
	`image` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` varchar(500) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `Badge_id` PRIMARY KEY(`id`),
	CONSTRAINT `Badge_id_key` UNIQUE(`id`),
	CONSTRAINT `Badge_name_key` UNIQUE(`name`)
);

CREATE TABLE `UserBadge` (
	`userId` varchar(191) NOT NULL,
	`badgeId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);

CREATE INDEX `UserBadge_userId_idx` ON `UserBadge` (`userId`);
CREATE INDEX `UserBadge_badgeId_idx` ON `UserBadge` (`badgeId`);