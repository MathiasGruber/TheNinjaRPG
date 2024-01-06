ALTER TABLE `Village` ADD `description` varchar(512) DEFAULT '' NOT NULL;
ALTER TABLE `Village` ADD `createdAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;
ALTER TABLE `Village` ADD `updatedAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;