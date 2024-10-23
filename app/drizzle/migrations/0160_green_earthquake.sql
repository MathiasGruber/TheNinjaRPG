ALTER TABLE `ConversationComment` ADD `isReported` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ForumPost` ADD `isReported` boolean DEFAULT false NOT NULL;