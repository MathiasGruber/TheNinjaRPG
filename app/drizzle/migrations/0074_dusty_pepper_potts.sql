ALTER TABLE `UserData` ADD `showPvpRecord` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserData` ADD `pvpWins` int DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` ADD `pvpLosses` int DEFAULT 0 NOT NULL;