ALTER TABLE `UserData` MODIFY COLUMN `immunityUntil` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3));
ALTER TABLE `UserData` ADD `curEnergy` int DEFAULT 100 NOT NULL;
ALTER TABLE `UserData` ADD `maxEnergy` int DEFAULT 100 NOT NULL;
ALTER TABLE `UserData` ADD `trainingStartedAt` datetime(3);
ALTER TABLE `UserData` ADD `currentlyTraining` enum('strength','intelligence','willpower','speed','ninjutsuOffence','ninjutsuDefence','genjutsuOffence','genjutsuDefence','taijutsuOffence','taijutsuDefence','bukijutsuDefence','bukijutsuOffence');