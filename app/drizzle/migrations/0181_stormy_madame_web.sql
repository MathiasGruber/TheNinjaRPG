ALTER TABLE `UserData` MODIFY COLUMN `role` enum('USER','CODING-ADMIN','CONTENT-ADMIN','MODERATOR-ADMIN','HEAD_MODERATOR','MODERATOR','JR_MODERATOR','CONTENT','EVENT') NOT NULL DEFAULT 'USER';