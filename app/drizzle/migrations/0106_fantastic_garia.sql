CREATE TABLE `WebStoreBundle` (
	`id` varchar(191) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`priceCents` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`contents` json NOT NULL,
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `WebStoreBundle_id` PRIMARY KEY(`id`)
);

CREATE TABLE `WebStoreOrder` (
	`id` varchar(191) NOT NULL,
	`buyerId` varchar(191) NOT NULL,
	`recipientId` varchar(191) NOT NULL,
	`name` varchar(100) NOT NULL,
	`priceCents` int NOT NULL,
	`contents` json NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`expiresAt` datetime(3) NOT NULL,
	`grantedAt` datetime(3),
	`captureId` varchar(191),
	CONSTRAINT `WebStoreOrder_id` PRIMARY KEY(`id`),
	CONSTRAINT `WebStoreOrder_captureId_key` UNIQUE(`captureId`)
);

CREATE INDEX `WebStoreOrder_buyerId_idx` ON `WebStoreOrder` (`buyerId`);