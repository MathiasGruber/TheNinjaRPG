CREATE TABLE `RewardNode` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`fields` json NOT NULL,
	CONSTRAINT `RewardNode_id` PRIMARY KEY(`id`)
);

CREATE TABLE `RewardPackage` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` text NOT NULL,
	`rewards` json NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `RewardPackage_id` PRIMARY KEY(`id`)
);
