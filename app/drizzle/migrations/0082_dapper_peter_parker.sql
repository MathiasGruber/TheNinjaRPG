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

CREATE TABLE `QuestParty` (
	`id` varchar(191) NOT NULL,
	`questId` varchar(191) NOT NULL,
	`leaderId` varchar(191) NOT NULL,
	`isPublic` boolean NOT NULL DEFAULT false,
	`memberIds` json NOT NULL,
	`invitedUserIds` json NOT NULL,
	`tracker` json NOT NULL,
	`contributions` json NOT NULL,
	`version` int NOT NULL DEFAULT 0,
	`battleId` varchar(191),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `QuestParty_id` PRIMARY KEY(`id`)
);

ALTER TABLE `Quest` ADD `teamEnabled` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserData` ADD `questPartyId` varchar(191);
CREATE INDEX `DungeonMember_user_idx` ON `DungeonMember` (`userId`);
CREATE INDEX `DungeonRun_status_idx` ON `DungeonRun` (`status`);
CREATE INDEX `QuestParty_questId_idx` ON `QuestParty` (`questId`);
CREATE INDEX `UserData_questPartyId_idx` ON `UserData` (`questPartyId`);