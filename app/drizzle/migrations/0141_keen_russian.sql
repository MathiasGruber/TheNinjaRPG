ALTER TABLE `Village` RENAME COLUMN `pvpEnabled` TO `pvpDisabled`;
ALTER TABLE `Village` MODIFY COLUMN `pvpDisabled` boolean NOT NULL DEFAULT false;

UPDATE Village SET pvpDisabled = 1 WHERE `name` = 'Wake Island';
UPDATE Village SET pvpDisabled = 1 WHERE `name` = 'Freedom State';