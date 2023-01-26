DROP TABLE `BugReport`;
DROP TABLE `BugVotes`;
ALTER TABLE `UserData` ADD `immunityUntil` datetime(3) DEFAULT (NOW(3) + INTERVAL 1 DAY) NOT NULL;