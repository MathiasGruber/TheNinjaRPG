CREATE TABLE `ModerationScan` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`relationId` varchar(191) NOT NULL,
	`relationType` enum('comment','privateMessage','forumPost','userReport','userNindo','clanOrder','anbuOrder','kageOrder','userAvatar') NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`completedAt` datetime(3),
	`outcome` enum('CHECKING','GATE_CLEAR','DECISION_CLEAR','REPORTED','ERROR') NOT NULL DEFAULT 'CHECKING',
	`flagged` boolean,
	`categoryScores` json,
	`reportId` varchar(191),
	`gateModel` varchar(191) NOT NULL,
	`decisionModel` varchar(191) NOT NULL,
	`promptVersion` varchar(191) NOT NULL,
	`errorStage` enum('gate','decision','report'),
	CONSTRAINT `ModerationScan_id` PRIMARY KEY(`id`)
);

ALTER TABLE `UserReport` ADD `predictedAt` datetime(3);
ALTER TABLE `UserReport` ADD `predictionModel` varchar(191);
ALTER TABLE `UserReport` ADD `promptVersion` varchar(191);
CREATE INDEX `ModerationScan_createdAt_idx` ON `ModerationScan` (`createdAt`);
CREATE INDEX `ModerationScan_userId_idx` ON `ModerationScan` (`userId`);
CREATE INDEX `UserReport_createdAt_idx` ON `UserReport` (`createdAt`);