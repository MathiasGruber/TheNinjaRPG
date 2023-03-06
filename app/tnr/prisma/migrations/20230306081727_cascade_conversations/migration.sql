-- DropForeignKey
ALTER TABLE `UsersInConversation` DROP FOREIGN KEY `UsersInConversation_conversationId_fkey`;

-- DropForeignKey
ALTER TABLE `UsersInConversation` DROP FOREIGN KEY `UsersInConversation_userId_fkey`;

-- AddForeignKey
ALTER TABLE `UsersInConversation` ADD CONSTRAINT `UsersInConversation_conversationId_fkey` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UsersInConversation` ADD CONSTRAINT `UsersInConversation_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
