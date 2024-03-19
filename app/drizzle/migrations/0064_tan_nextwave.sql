ALTER TABLE `UserData` MODIFY COLUMN `primaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light');
ALTER TABLE `UserData` MODIFY COLUMN `secondaryElement` enum('Fire','Water','Wind','Earth','Lightning','Ice','Crystal','Dust','Shadow','Wood','Scorch','Storm','Magnet','Yin-Yang','Lava','Explosion','Light');
ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI') NOT NULL;
ALTER TABLE `UserData` ADD `senseiId` varchar(191);