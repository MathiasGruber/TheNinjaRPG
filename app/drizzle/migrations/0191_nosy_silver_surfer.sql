ALTER TABLE `Village` MODIFY COLUMN `type` enum('VILLAGE','OUTLAW','SAFEZONE','HIDEOUT','TOWN') NOT NULL DEFAULT 'VILLAGE';
ALTER TABLE `Clan` ADD `repTreasury` int DEFAULT 0 NOT NULL;
ALTER TABLE `Clan` ADD `hasHideout` boolean DEFAULT false NOT NULL;
ALTER TABLE `Village` ADD `lastMaintenancePaidAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `Village` ADD `wasDowngraded` boolean DEFAULT false NOT NULL;