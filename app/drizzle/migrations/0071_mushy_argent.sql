ALTER TABLE `Quest` MODIFY COLUMN `questType` enum('starter','tier','daily','mission','village_mission','errand','crime','exam','event','story','anbu','medical','hunting','gathering','battlepyramid','pvp','achievement','war','raid','overworld','mastery') NOT NULL;
ALTER TABLE `QuestHistory` MODIFY COLUMN `questType` enum('starter','tier','daily','mission','village_mission','errand','crime','exam','event','story','anbu','medical','hunting','gathering','battlepyramid','pvp','achievement','war','raid','overworld','mastery') NOT NULL;
ALTER TABLE `Village` ADD `structureMaintenanceDue` int DEFAULT 0 NOT NULL;
ALTER TABLE `Village` ADD `structureMaintenanceMonth` varchar(7);
ALTER TABLE `Village` ADD `activeMission` json;
ALTER TABLE `Village` ADD `missionCounters` json DEFAULT ('{}') NOT NULL;
UPDATE `Village` SET `structureMaintenanceMonth` = DATE_FORMAT(UTC_DATE(), '%Y-%m');
-- Preserve S-rank templates in the quest editor; only collective counter objectives are selectable.
UPDATE `Quest` SET `questType` = 'village_mission' WHERE `questType` = 'mission' AND `questRank` = 'S';
-- Retired personal assignments must not remain active in a hall that no longer offers them.
UPDATE `QuestHistory` h INNER JOIN `Quest` q ON h.`questId` = q.`id`
SET h.`endedAt` = UTC_TIMESTAMP(3)
WHERE q.`questType` = 'village_mission' AND h.`questType` = 'mission' AND h.`completed` = 0 AND h.`endedAt` IS NULL;

-- Collective templates are editable through the existing staff quest editor.
INSERT INTO `Quest` (`id`, `name`, `description`, `questRank`, `questType`, `hidden`, `consecutiveObjectives`, `maxAttempts`, `maxCompletes`, `content`) VALUES ('village-mission-pvp', 'Village Defense', 'Defeat opposing shinobi together.', 'S', 'village_mission', false, false, 100, 100, '{"reward":{"reward_tokens":100000},"objectives":[{"id":"pvp_kills","task":"pvp_kills","description":"Defeat 1,000 opposing players.","value":1000}],"sceneBackground":"","sceneCharacters":[]}');
INSERT INTO `Quest` (`id`, `name`, `description`, `questRank`, `questType`, `hidden`, `consecutiveObjectives`, `maxAttempts`, `maxCompletes`, `content`) VALUES ('village-mission-effort', 'Combined Mission Effort', 'Complete missions together to support the village.', 'S', 'village_mission', false, false, 100, 100, '{"reward":{"reward_tokens":100000},"objectives":[{"id":"combined_mission_effort","task":"combined_mission_effort","description":"Earn 1,000 points by completing D, C, B and A rank missions.","value":1000}],"sceneBackground":"","sceneCharacters":[]}');
INSERT INTO `Quest` (`id`, `name`, `description`, `questRank`, `questType`, `hidden`, `consecutiveObjectives`, `maxAttempts`, `maxCompletes`, `content`) VALUES ('village-mission-siege', 'Siege Operation', 'Coordinate attacks against enemy shrines during war.', 'S', 'village_mission', false, false, 100, 100, '{"reward":{"reward_tokens":100000},"objectives":[{"id":"siege_operation","task":"siege_operation","description":"Deal 1,000 total damage to enemy shrines.","value":1000}],"sceneBackground":"","sceneCharacters":[]}');
