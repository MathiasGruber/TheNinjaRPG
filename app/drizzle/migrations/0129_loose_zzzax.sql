CREATE TABLE `Captcha` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(191) NOT NULL,
	`captcha` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL 1 DAY ),
	`success` boolean NOT NULL DEFAULT false,
	`used` boolean NOT NULL DEFAULT false,
	CONSTRAINT `Captcha_id` PRIMARY KEY(`id`)
);

CREATE INDEX `Captcha_userId_key` ON `Captcha` (`userId`);
CREATE INDEX `Captcha_used_idx` ON `Captcha` (`used`);