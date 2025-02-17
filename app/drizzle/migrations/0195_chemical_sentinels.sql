ALTER TABLE `UserVote` ADD `bbogd` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserVote` DROP COLUMN `gamesTop200`;
ALTER TABLE `UserVote` DROP COLUMN `mmorpg100`;