CREATE TABLE `UserRequest` (
	`id` varchar(191) NOT NULL,
	`senderId` varchar(191) NOT NULL,
	`receiverId` varchar(191) NOT NULL,
	`status` enum('PENDING','ACCEPTED','REJECTED','CANCELLED','EXPIRED') NOT NULL,
	`type` enum('SPAR','ALLIANCE','SURRENDER','TEACHER','STUDENT') NOT NULL,
	`createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `UserRequest_id` PRIMARY KEY(`id`)
);

CREATE INDEX `UserRequest_createdAt_idx` ON `UserRequest` (`createdAt`);
CREATE INDEX `UserRequest_senderId_idx` ON `UserRequest` (`senderId`);
CREATE INDEX `UserRequest_receiverId_idx` ON `UserRequest` (`receiverId`);
CREATE INDEX `UserRequest_type_idx` ON `UserRequest` (`type`);