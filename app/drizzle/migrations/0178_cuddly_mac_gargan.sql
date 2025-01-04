CREATE TABLE `LinkPromotion` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`url` varchar(191) NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`reviewed` boolean NOT NULL DEFAULT false,
	`reviewedBy` varchar(191),
	`reviewedAt` datetime(3),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `LinkPromotion_id` PRIMARY KEY(`id`)
);

CREATE INDEX `LinkPromotion_userId_idx` ON `LinkPromotion` (`userId`);
CREATE INDEX `LinkPromotion_reviewedBy_idx` ON `LinkPromotion` (`reviewedBy`);