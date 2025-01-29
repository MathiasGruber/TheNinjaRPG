CREATE TABLE `SkillTree` (
       `id` varchar(191) NOT NULL,
       `userId` varchar(191) NOT NULL,
       `points` int NOT NULL DEFAULT 0,
       `resetCount` int NOT NULL DEFAULT 0,
       `selectedSkills` json NOT NULL DEFAULT ('[]'),
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `SkillTree_id` PRIMARY KEY(`id`),
       CONSTRAINT `SkillTree_userId_idx` UNIQUE(`userId`)
);
