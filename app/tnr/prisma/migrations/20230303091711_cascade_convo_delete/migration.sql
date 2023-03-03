-- DropForeignKey
ALTER TABLE `ConversationComment` DROP FOREIGN KEY `ConversationComment_conversationId_fkey`;

-- AddForeignKey
ALTER TABLE `ConversationComment` ADD CONSTRAINT `ConversationComment_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
