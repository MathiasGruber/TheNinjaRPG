CREATE TABLE `backgroundSchema` (
	`id` varchar(191) NOT NULL,
	`schema` json NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` varchar(191) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `backgroundSchema_id` PRIMARY KEY(`id`),
	CONSTRAINT `backgroundSchema_name_key` UNIQUE(`name`)
);
