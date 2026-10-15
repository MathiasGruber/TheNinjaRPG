ALTER TABLE `UserData` ADD `homeRoomStyles` json DEFAULT ('[]') NOT NULL;
ALTER TABLE `UserData` ADD `homePublic` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserData` ADD `homeInvitations` json DEFAULT ('[]') NOT NULL;
ALTER TABLE `UserItem` ADD `homeRoom` enum('main','room-1','room-2','room-3','room-4','room-5','room-6','yard') DEFAULT 'main' NOT NULL;