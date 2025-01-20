CREATE TABLE `UserPreferences` (
  `id` varchar(191) NOT NULL,
  `userId` varchar(191) NOT NULL,
  `highestOffense` ENUM('ninjutsu', 'genjutsu', 'taijutsu', 'bukijutsu') NULL,
  `highestGeneral1` ENUM('strength', 'intelligence', 'willpower', 'speed') NULL,
  `highestGeneral2` ENUM('strength', 'intelligence', 'willpower', 'speed') NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `UserPreferences_userId_key` (`userId`),
  FOREIGN KEY (`userId`) REFERENCES `UserData` (`userId`) ON DELETE CASCADE
);
