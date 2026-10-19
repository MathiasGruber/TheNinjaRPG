ALTER TABLE `Quest` ADD `publicLocations` boolean DEFAULT false NOT NULL;
CREATE INDEX `Quest_publicLocations_hidden_idx` ON `Quest` (`publicLocations`,`hidden`);