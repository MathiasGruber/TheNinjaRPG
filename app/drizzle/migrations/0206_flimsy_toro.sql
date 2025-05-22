CREATE TABLE `UserUpload` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`imageUrl` varchar(255) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserUpload_id` PRIMARY KEY(`id`)
);

CREATE INDEX `UserUpload_userId_idx` ON `UserUpload` (`userId`);