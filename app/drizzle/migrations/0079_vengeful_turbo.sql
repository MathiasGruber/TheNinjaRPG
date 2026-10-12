ALTER TABLE `QuestHistory` ADD `entryPaid` boolean DEFAULT false NOT NULL;
ALTER TABLE `QuestHistory` ADD `isolated` boolean DEFAULT false NOT NULL;
ALTER TABLE `QuestHistory` ADD `questVersion` datetime(3);
UPDATE `QuestHistory` AS h JOIN `Quest` AS q ON q.`id` = h.`questId` SET h.`questVersion` = q.`updatedAt` WHERE h.`questType` = 'battlepyramid' AND h.`endedAt` IS NULL AND h.`completed` = 0;
