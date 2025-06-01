CREATE TABLE `UserActivityEvent` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(191) NOT NULL,
	`streak` int NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserActivityEvent_id` PRIMARY KEY(`id`)
);
