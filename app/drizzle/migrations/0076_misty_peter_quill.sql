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
CREATE INDEX `QuestParty_questId_idx` ON `QuestParty` (`questId`);
CREATE INDEX `UserData_questPartyId_idx` ON `UserData` (`questPartyId`);