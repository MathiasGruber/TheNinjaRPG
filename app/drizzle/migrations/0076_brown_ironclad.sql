ALTER TABLE `UserData` ADD `homeFurniture` json DEFAULT ('{"owned":[],"layouts":{}}') NOT NULL;
ALTER TABLE `UserData` ADD `homeFurnitureRevision` int unsigned DEFAULT 0 NOT NULL;