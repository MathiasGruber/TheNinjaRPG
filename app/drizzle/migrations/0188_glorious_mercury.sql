CREATE TABLE `KageChallengeRequest` (
       `id` varchar(191) NOT NULL,
       `userId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `kageId` varchar(191) NOT NULL,
       `accepted` boolean NOT NULL DEFAULT false,
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `expiresAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3) + INTERVAL 30 MINUTE),
       CONSTRAINT `KageChallengeRequest_id` PRIMARY KEY(`id`)
);

CREATE TABLE `KagePrestige` (
       `id` varchar(191) NOT NULL,
       `userId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `prestige` float NOT NULL DEFAULT 5000,
       `lastPrestigeUpdate` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `KagePrestige_id` PRIMARY KEY(`id`)
);

CREATE TABLE `KagePrestigeTransfer` (
       `id` varchar(191) NOT NULL,
       `fromUserId` varchar(191) NOT NULL,
       `toUserId` varchar(191) NOT NULL,
       `villageId` varchar(191) NOT NULL,
       `amount` float NOT NULL,
       `accepted` boolean NOT NULL DEFAULT false,
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `KagePrestigeTransfer_id` PRIMARY KEY(`id`)
);

CREATE INDEX `KageChallengeRequest_userId_idx` ON `KageChallengeRequest` (`userId`);
CREATE INDEX `KageChallengeRequest_villageId_idx` ON `KageChallengeRequest` (`villageId`);
CREATE INDEX `KageChallengeRequest_kageId_idx` ON `KageChallengeRequest` (`kageId`);
CREATE INDEX `KagePrestige_userId_idx` ON `KagePrestige` (`userId`);
CREATE INDEX `KagePrestige_villageId_idx` ON `KagePrestige` (`villageId`);
CREATE INDEX `KagePrestigeTransfer_fromUserId_idx` ON `KagePrestigeTransfer` (`fromUserId`);
CREATE INDEX `KagePrestigeTransfer_toUserId_idx` ON `KagePrestigeTransfer` (`toUserId`);
CREATE INDEX `KagePrestigeTransfer_villageId_idx` ON `KagePrestigeTransfer` (`villageId`);
