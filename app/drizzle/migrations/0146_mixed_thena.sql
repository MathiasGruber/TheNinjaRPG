CREATE TABLE `UserAssociation` (
	`id` varchar(191) NOT NULL,
	`userOne` varchar(191) NOT NULL,
	`userTwo` varchar(191) NOT NULL,
	`associationType` enum('MARRIAGE','DIVORCED') NOT NULL DEFAULT 'MARRIAGE',
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserAssociation_id` PRIMARY KEY(`id`),
	CONSTRAINT `UserOne_UserTwo_UserAssociation_key` UNIQUE(`userOne`,`userTwo`,`associationType`)
);

ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU','CLAN','MARRIAGE') NOT NULL;
ALTER TABLE `UserData` ADD `marriageSlots` int unsigned DEFAULT 1 NOT NULL;
CREATE INDEX `UserAttribute_userOne_idx` ON `UserAssociation` (`userOne`);
CREATE INDEX `UserAttribute_userTwo_idx` ON `UserAssociation` (`userTwo`);