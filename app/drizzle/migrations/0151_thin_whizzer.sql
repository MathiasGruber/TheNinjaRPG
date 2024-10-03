CREATE TABLE `AiProfile` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`rules` json NOT NULL,
	CONSTRAINT `AiProfile_id` PRIMARY KEY(`id`),
	CONSTRAINT `AiProfile_userId_idx` UNIQUE(`userId`)
);

ALTER TABLE `UserData` ADD `aiProfileId` varchar(191);

INSERT INTO `AiProfile` (`id`, `userId`, `rules`) VALUES ('Default', '', '[]');