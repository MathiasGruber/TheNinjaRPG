CREATE TABLE `EmailReminder` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(191),
	`callName` varchar(191),
	`email` varchar(191) NOT NULL,
	`latestRejoinRequest` datetime(3),
	`lastActivity` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`secret` varchar(191) NOT NULL,
	`disabled` boolean NOT NULL DEFAULT false,
	`validated` boolean NOT NULL DEFAULT true,
	CONSTRAINT `EmailReminder_id` PRIMARY KEY(`id`)
);
