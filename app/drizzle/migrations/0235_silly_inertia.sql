ALTER TABLE `Item` ADD `requiredLevel` int DEFAULT 1 NOT NULL;
CREATE INDEX `Item_requiredLevel_idx` ON `Item` (`requiredLevel`);