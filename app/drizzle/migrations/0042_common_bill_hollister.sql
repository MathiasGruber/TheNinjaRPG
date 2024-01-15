CREATE TABLE `BankTransfers` (
	`senderId` varchar(191) NOT NULL,
	`receiverId` varchar(191) NOT NULL,
	`amount` int NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);

CREATE INDEX `BankTransfers_senderId_idx` ON `BankTransfers` (`senderId`);
CREATE INDEX `BankTransfers_receiverId_idx` ON `BankTransfers` (`receiverId`);