ALTER TABLE `ActionLog` ADD `relatedValue` double DEFAULT 0 NOT NULL;
CREATE INDEX `ActionLog_relatedId_idx` ON `ActionLog` (`relatedId`);
CREATE INDEX `ActionLog_tableName_idx` ON `ActionLog` (`tableName`);