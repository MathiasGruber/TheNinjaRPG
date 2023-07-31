CREATE TABLE `DataBattleAction` (
	`id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
	`battleType` enum('jutsu','item','bloodline','basic') NOT NULL,
	`contentId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`battleWon` tinyint NOT NULL DEFAULT 0);

DROP INDEX `UserData_userId_idx` ON `UserData`;
CREATE UNIQUE INDEX `DataBattleActions_id` ON `DataBattleAction` (`id`);
CREATE INDEX `DataBattleActions_type` ON `DataBattleAction` (`battleType`);
CREATE INDEX `ConversationComment_createdAt_idx` ON `ConversationComment` (`createdAt`);
CREATE INDEX `HistoricalAvatar_done_idx` ON `HistoricalAvatar` (`done`);