CREATE TABLE `DailyReset` (
	`id` varchar(191) NOT NULL,
	`resetType` enum('daily-bank','daily-counters','daily-pvp','daily-quest') NOT NULL,
	`scheduledDate` datetime(3) NOT NULL,
	`executedDate` datetime(3),
	`status` enum('pending','completed','failed') NOT NULL DEFAULT 'pending',
	`lastChecked` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`errorLog` text,
	`isManualOverride` boolean NOT NULL DEFAULT false,
	`retryCount` int NOT NULL DEFAULT 0,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `DailyReset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `DailyReset_resetType_idx` ON `DailyReset` (`resetType`);--> statement-breakpoint
CREATE INDEX `DailyReset_status_idx` ON `DailyReset` (`status`);--> statement-breakpoint
CREATE INDEX `DailyReset_scheduledDate_idx` ON `DailyReset` (`scheduledDate`);