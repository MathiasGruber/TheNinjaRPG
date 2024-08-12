CREATE TABLE `TrainingLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` varchar(191) NOT NULL,
	`amount` double NOT NULL,
	`stat` enum('ninjutsuOffence','taijutsuOffence','genjutsuOffence','bukijutsuOffence','ninjutsuDefence','taijutsuDefence','genjutsuDefence','bukijutsuDefence','strength','speed','intelligence','willpower'),
	`speed` enum('15min','1hr','4hrs','8hrs'),
	`trainingFinishedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `TrainingLog_id` PRIMARY KEY(`id`)
);

CREATE INDEX `TrainingLog_userId_idx` ON `TrainingLog` (`userId`);
CREATE INDEX `TrainingLog_speed_idx` ON `TrainingLog` (`speed`);
CREATE INDEX `TrainingLog_stat_idx` ON `TrainingLog` (`stat`);
CREATE INDEX `Quest_maxLevel_idx` ON `Quest` (`maxLevel`);