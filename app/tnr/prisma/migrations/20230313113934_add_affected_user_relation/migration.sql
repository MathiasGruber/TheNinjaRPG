-- AddForeignKey
ALTER TABLE `PaypalTransaction` ADD CONSTRAINT `PaypalTransaction_customId_fkey` FOREIGN KEY (`customId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;
