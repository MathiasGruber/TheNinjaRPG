ALTER TABLE `UserVote` ADD `totalClaims` int DEFAULT 0 NOT NULL;
UPDATE `UserVote` SET `totalClaims` = 1 WHERE `claimed` = true;