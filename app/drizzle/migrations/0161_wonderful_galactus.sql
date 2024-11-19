CREATE TABLE `AutomatedModeration` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`content` text NOT NULL,
	`relationType` enum('comment','privateMessage','forumPost','userReport','userNindo','clanOrder','anbuOrder','kageOrder','userAvatar') NOT NULL,
	`sexual` boolean NOT NULL DEFAULT false,
	`sexual_minors` boolean NOT NULL DEFAULT false,
	`harassment` boolean NOT NULL DEFAULT false,
	`harassment_threatening` boolean NOT NULL DEFAULT false,
	`hate` boolean NOT NULL DEFAULT false,
	`hate_threatening` boolean NOT NULL DEFAULT false,
	`illicit` boolean NOT NULL DEFAULT false,
	`illicit_violent` boolean NOT NULL DEFAULT false,
	`self_harm` boolean NOT NULL DEFAULT false,
	`self_harm_intent` boolean NOT NULL DEFAULT false,
	`self_harm_instructions` boolean NOT NULL DEFAULT false,
	`violence` boolean NOT NULL DEFAULT false,
	`violence_graphic` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `AutomatedModeration_id` PRIMARY KEY(`id`)
);

ALTER TABLE `UserReportComment` ADD `isReported` boolean DEFAULT false NOT NULL;
CREATE INDEX `AutoMod_userId_idx` ON `AutomatedModeration` (`userId`);
CREATE INDEX `AutoMod_relationType_idx` ON `AutomatedModeration` (`relationType`);