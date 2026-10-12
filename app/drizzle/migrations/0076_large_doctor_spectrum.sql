CREATE TABLE `Dungeon` (
	`id` varchar(191) NOT NULL,
	`content` json NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `Dungeon_id` PRIMARY KEY(`id`)
);

CREATE TABLE `DungeonMember` (
	`runId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`activeUserId` varchar(191),
	`reward` json,
	CONSTRAINT `DungeonMember_runId_userId_pk` PRIMARY KEY(`runId`,`userId`),
	CONSTRAINT `DungeonMember_active_idx` UNIQUE(`activeUserId`)
);

CREATE TABLE `DungeonRun` (
	`id` varchar(191) NOT NULL,
	`dungeonId` varchar(191) NOT NULL,
	`leaderId` varchar(191) NOT NULL,
	`content` json NOT NULL,
	`state` json NOT NULL,
	`status` enum('LOBBY','STARTING','FIGHTING','BETWEEN','PAUSED','COMPLETED','ENDED') NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`battleId` varchar(191),
	`createdAt` datetime(3) NOT NULL,
	`expiresAt` datetime(3),
	CONSTRAINT `DungeonRun_id` PRIMARY KEY(`id`)
);

CREATE INDEX `DungeonMember_user_idx` ON `DungeonMember` (`userId`);
CREATE INDEX `DungeonRun_status_idx` ON `DungeonRun` (`status`);