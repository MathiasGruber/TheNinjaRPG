CREATE TABLE `UserNindo` (
	`id` varchar(191) PRIMARY KEY NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
	`updatedAt` datetime(3) NOT NULL DEFAULT current_timestamp(3),
	`userId` varchar(191) NOT NULL,
	`content` text NOT NULL, 
	UNIQUE KEY `UserNindo_id_key` (`id`),
	UNIQUE KEY `UserNindo_userId_key` (`userId`)
)  ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;