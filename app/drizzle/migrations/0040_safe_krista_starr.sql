CREATE TABLE `ConceptImage` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`image` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`status` varchar(191) NOT NULL DEFAULT 'started',
	`hidden` tinyint NOT NULL DEFAULT 0,
	`prompt` varchar(5000) NOT NULL,
	`negative_prompt` varchar(5000) NOT NULL DEFAULT '',
	`seed` int NOT NULL DEFAULT 42,
	`guidance_scale` int NOT NULL DEFAULT 4,
	`n_likes` int NOT NULL DEFAULT 0,
	`n_loves` int NOT NULL DEFAULT 0,
	`n_laugh` int NOT NULL DEFAULT 0,
	`n_comments` int NOT NULL DEFAULT 0,
	`description` varchar(255),
	`done` tinyint NOT NULL DEFAULT 0,
	CONSTRAINT `ConceptImage_id` PRIMARY KEY(`id`),
	CONSTRAINT `image_id_key` UNIQUE(`id`),
	CONSTRAINT `image_avatar_key` UNIQUE(`image`)
) ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;;

CREATE TABLE `UserLikes` (
	`type` enum('like','love','laugh') NOT NULL,
	`userId` varchar(191) NOT NULL,
	`imageId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
) ENGINE InnoDB,
  CHARSET utf8mb4,
  COLLATE utf8mb4_unicode_ci;;

CREATE INDEX `image_done_idx` ON `ConceptImage` (`done`);
CREATE INDEX `image_userId_idx` ON `ConceptImage` (`userId`);
CREATE INDEX `image_avatar_idx` ON `ConceptImage` (`image`);
CREATE INDEX `userLikes_userId_idx` ON `UserLikes` (`userId`);
CREATE INDEX `userLikes_imageId_idx` ON `UserLikes` (`imageId`);