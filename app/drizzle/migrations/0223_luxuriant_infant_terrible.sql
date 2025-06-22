CREATE INDEX `BankTransfers_senderId_receiverId_idx` ON `BankTransfers` (`senderId`,`receiverId`);
CREATE INDEX `BankTransfers_createdAt_idx` ON `BankTransfers` (`createdAt`);