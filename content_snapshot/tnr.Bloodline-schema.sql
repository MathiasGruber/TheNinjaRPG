CREATE TABLE `Bloodline` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `effects` json NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `regenIncrease` int NOT NULL DEFAULT '0',
  `village` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `image` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `rank` enum('D','C','B','A','S') COLLATE utf8mb4_unicode_ci NOT NULL,
  `hidden` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `Bloodline_name_key` (`name`),
  UNIQUE KEY `Bloodline_image_key` (`image`),
  KEY `Bloodline_village_idx` (`village`),
  KEY `Bloodline_rank_idx` (`rank`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
