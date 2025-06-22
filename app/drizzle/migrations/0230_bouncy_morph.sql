ALTER TABLE `UserData` ADD `staffAccount` boolean DEFAULT false NOT NULL;

UPDATE UserData SET staffAccount = true WHERE role != 'USER';