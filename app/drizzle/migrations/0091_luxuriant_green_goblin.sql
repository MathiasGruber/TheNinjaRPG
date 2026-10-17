CREATE TABLE `Title` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`description` varchar(512) NOT NULL DEFAULT '',
	`effects` json NOT NULL DEFAULT ('[]'),
	`legacyOwnerId` varchar(191),
	`archived` boolean NOT NULL DEFAULT false,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `Title_id` PRIMARY KEY(`id`)
);

CREATE TABLE `UserTitle` (
	`userId` varchar(191) NOT NULL,
	`titleId` varchar(191) NOT NULL,
	`effects` json NOT NULL DEFAULT ('[]'),
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserTitle_userId_titleId_pk` PRIMARY KEY(`userId`,`titleId`)
);

ALTER TABLE `UserData` RENAME COLUMN `customTitle` TO `npcTitle`;
ALTER TABLE `ContentProposalBasis` MODIFY COLUMN `entityType` enum('JUTSU','ITEM','BLOODLINE','QUEST','BADGE','TITLE','GAME_ASSET','AI') NOT NULL;
ALTER TABLE `ContentProposalChange` MODIFY COLUMN `entityType` enum('JUTSU','ITEM','BLOODLINE','QUEST','BADGE','TITLE','GAME_ASSET','AI') NOT NULL;
ALTER TABLE `UserData` ADD `activeTitleId` varchar(191);
CREATE INDEX `Title_catalog_idx` ON `Title` (`legacyOwnerId`,`archived`);
CREATE INDEX `UserTitle_title_idx` ON `UserTitle` (`titleId`);

-- Each player retains their exact label in a private title; AI labels stay authored on the NPC.
INSERT INTO `Title` (`id`, `name`, `legacyOwnerId`)
SELECT CONCAT('legacy-', SHA2(`userId`, 256)), `npcTitle`, `userId`
FROM `UserData` WHERE `isAi` = false AND LENGTH(`npcTitle`) > 0;

INSERT INTO `UserTitle` (`userId`, `titleId`)
SELECT `legacyOwnerId`, `id` FROM `Title` WHERE `legacyOwnerId` IS NOT NULL;

UPDATE `UserData` u INNER JOIN `Title` t ON t.`legacyOwnerId` = u.`userId`
SET u.`activeTitleId` = t.`id` WHERE u.`isAi` = false;

UPDATE `UserData` SET `npcTitle` = '' WHERE `isAi` = false;
