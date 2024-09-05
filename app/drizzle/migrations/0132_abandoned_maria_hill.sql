ALTER TABLE `BloodlineRolls` DROP INDEX `BloodlineRolls_userId_key`;
ALTER TABLE `BloodlineRolls` ADD `type` enum('NATURAL','ITEM') DEFAULT 'NATURAL' NOT NULL;
ALTER TABLE `BloodlineRolls` ADD `rank` enum('D','C','B','A','S','H');
CREATE INDEX `BloodlineRolls_userId_idx` ON `BloodlineRolls` (`userId`);