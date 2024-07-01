ALTER TABLE `Village` ADD `type` enum('VILLAGE','OUTLAW','SAFEZONE') DEFAULT 'VILLAGE' NOT NULL;
ALTER TABLE `Village` DROP COLUMN `isOutlawFaction`;
UPDATE `Village` SET type = 'OUTLAW' WHERE name = 'Syndicate';

INSERT INTO `Village` (id, name, sector, type, hexColor, kageId) VALUES ('1nSqxViGqnXp_xXAPeQMC', 'Wake Island', 222, 'SAFEZONE', '#f59fe4', '');