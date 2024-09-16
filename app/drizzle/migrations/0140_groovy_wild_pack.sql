ALTER TABLE `Village` ADD `pvpEnabled` boolean DEFAULT true NOT NULL;

UPDATE Village SET pvpEnabled = 0 WHERE `name` = 'Wake Island';
UPDATE Village SET pvpEnabled = 0 WHERE `name` = 'Freedom State';