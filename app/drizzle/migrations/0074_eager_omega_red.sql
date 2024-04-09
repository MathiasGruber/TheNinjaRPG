ALTER TABLE `UserData` ADD `pvpActivity` int DEFAULT 0 NOT NULL;
ALTER TABLE `UserData` DROP COLUMN `eloPve`;
ALTER TABLE `UserData` DROP COLUMN `eloPvp`;