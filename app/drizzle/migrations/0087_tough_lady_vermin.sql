CREATE TABLE `UserHome` (
	`userId` varchar(191) NOT NULL,
	`roomStyles` json NOT NULL DEFAULT ('[]'),
	`isPublic` boolean NOT NULL DEFAULT false,
	CONSTRAINT `UserHome_userId` PRIMARY KEY(`userId`)
);

ALTER TABLE `UserItem` ADD `homeRoom` enum('main','room-1','room-2','room-3','room-4','room-5','room-6','room-7','room-8','room-9','yard') DEFAULT 'main' NOT NULL;
ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU','CLAN','MARRIAGE','KAGE','WAR_ALLY','HOME') NOT NULL;
ALTER TABLE `UserRequest` ADD `activeHomeReceiverId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `type` = 'HOME' AND `status` IN ('PENDING', 'ACCEPTED') THEN `receiverId` ELSE NULL END) STORED;
ALTER TABLE `UserRequest` ADD CONSTRAINT `UserRequest_active_home_pair_unique` UNIQUE(`senderId`,`activeHomeReceiverId`);
