ALTER TABLE `ConversationComment` ADD `isReported` boolean DEFAULT false NOT NULL;
ALTER TABLE `ForumPost` ADD `isReported` boolean DEFAULT false NOT NULL;