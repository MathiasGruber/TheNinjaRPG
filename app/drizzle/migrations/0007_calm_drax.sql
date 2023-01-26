DROP INDEX `Conversation_title_key` ON `Conversation`;
CREATE INDEX `Conversation_title_key` ON `Conversation` (`title`);