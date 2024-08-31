CREATE INDEX `QuestHistory_questType_idx` ON `QuestHistory` (`questType`);
CREATE INDEX `QuestHistory_endedAt_idx` ON `QuestHistory` (`endedAt`);
CREATE INDEX `UserData_isAi_idx` ON `UserData` (`isAi`);
CREATE INDEX `UserData_rank_idx` ON `UserData` (`rank`);
CREATE INDEX `UserData_clanId_idx` ON `UserData` (`clanId`);
CREATE INDEX `UserData_anbuId_idx` ON `UserData` (`anbuId`);
CREATE INDEX `UserData_jutsuLoadout_idx` ON `UserData` (`jutsuLoadout`);
CREATE INDEX `UserData_level_idx` ON `UserData` (`level`);