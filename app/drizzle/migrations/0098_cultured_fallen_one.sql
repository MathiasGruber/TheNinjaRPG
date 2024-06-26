ALTER TABLE `UserData` RENAME COLUMN `isAI` TO `isAi`;
ALTER TABLE `UserData` MODIFY COLUMN `isAi` boolean NOT NULL;
ALTER TABLE `UserData` MODIFY COLUMN `isAi` boolean NOT NULL DEFAULT false;
ALTER TABLE `UserData` MODIFY COLUMN `isSummon` boolean NOT NULL;
ALTER TABLE `UserData` MODIFY COLUMN `isSummon` boolean NOT NULL DEFAULT false;
ALTER TABLE `UserData` ADD `inArena` boolean DEFAULT false NOT NULL;
UPDATE `UserData` SET `inArena` = 1 WHERE `isAi` = 1 AND `rank` != 'ELDER';