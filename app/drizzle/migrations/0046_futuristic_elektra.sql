CREATE INDEX `QuestHistory_userId_idx` ON `QuestHistory` (`userId`);
CREATE INDEX `QuestHistory_questId_idx` ON `QuestHistory` (`questId`);
CREATE INDEX `QuestHistory_completed_idx` ON `QuestHistory` (`completed`);
ALTER TABLE `QuestHistory` ADD CONSTRAINT `QuestHistory_id_key` UNIQUE(`id`);