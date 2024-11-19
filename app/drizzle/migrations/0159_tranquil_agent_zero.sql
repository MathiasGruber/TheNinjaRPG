CREATE TABLE `UserReview` (
	`id` varchar(191) NOT NULL,
	`authorUserId` varchar(191) NOT NULL,
	`targetUserId` varchar(191) NOT NULL,
	`positive` boolean NOT NULL DEFAULT true,
	`review` text NOT NULL,
	`authorIp` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserReview_id` PRIMARY KEY(`id`)
);

CREATE INDEX `UserReview_authorUserId_idx` ON `UserReview` (`authorUserId`);
CREATE INDEX `UserReview_targetUserId_idx` ON `UserReview` (`targetUserId`);