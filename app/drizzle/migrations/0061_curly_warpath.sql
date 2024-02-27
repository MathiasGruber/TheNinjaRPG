ALTER TABLE `UserData` MODIFY COLUMN `primaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang');
ALTER TABLE `UserData` MODIFY COLUMN `secondaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang');
ALTER TABLE `UserData` MODIFY COLUMN `location` varchar(191) DEFAULT '';
ALTER TABLE `Village` ADD `tokens` int DEFAULT 0 NOT NULL;