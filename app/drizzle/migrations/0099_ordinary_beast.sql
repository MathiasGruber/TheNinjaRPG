ALTER TABLE `UserReport` ADD `updatedAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3)) NOT NULL;

UPDATE UserReport SET updatedAt = createdAt;