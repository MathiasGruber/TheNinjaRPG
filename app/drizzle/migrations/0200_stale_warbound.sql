CREATE TABLE `Poll` (
	`id` varchar(191) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`allowCustomOptions` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`endDate` datetime(3),
	`createdByUserId` varchar(191) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	CONSTRAINT `Poll_id` PRIMARY KEY(`id`)
)  ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PollOption` (
	`id` varchar(191) NOT NULL,
	`pollId` varchar(191) NOT NULL,
	`text` varchar(255) NOT NULL,
	`optionType` enum('text','user') NOT NULL DEFAULT 'text',
	`targetUserId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`createdByUserId` varchar(191) NOT NULL,
	`isCustomOption` boolean NOT NULL DEFAULT false,
	CONSTRAINT `PollOption_id` PRIMARY KEY(`id`)
)  ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE `UserPollVote` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`pollId` varchar(191) NOT NULL,
	`optionId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserPollVote_id` PRIMARY KEY(`id`),
	CONSTRAINT `UserPollVote_userId_pollId_idx` UNIQUE(`userId`,`pollId`)
)  ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;

CREATE INDEX `Poll_createdByUserId_idx` ON `Poll` (`createdByUserId`);
CREATE INDEX `PollOption_pollId_idx` ON `PollOption` (`pollId`);
CREATE INDEX `PollOption_createdByUserId_idx` ON `PollOption` (`createdByUserId`);
CREATE INDEX `PollOption_targetUserId_idx` ON `PollOption` (`targetUserId`);
CREATE INDEX `UserPollVote_pollId_idx` ON `UserPollVote` (`pollId`);
CREATE INDEX `UserPollVote_optionId_idx` ON `UserPollVote` (`optionId`);