ALTER TABLE `Quest` RENAME COLUMN `expiresAt` TO `endsAt`;
ALTER TABLE `Item` ADD `expireFromStoreAt` date;
ALTER TABLE `Quest` ADD `retryDelay` enum('daily','weekly','monthly','none') DEFAULT 'none' NOT NULL;
ALTER TABLE `Quest` ADD `startsAt` date;
ALTER TABLE `Quest` DROP COLUMN `timeFrame`;