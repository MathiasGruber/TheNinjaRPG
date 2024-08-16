ALTER TABLE `Village` ADD `mapName` varchar(191);
UPDATE Village SET mapName = 'City of Mei' WHERE name = 'Syndicate';