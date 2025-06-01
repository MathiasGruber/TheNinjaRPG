ALTER TABLE `HistoricalIp` MODIFY COLUMN `id` int AUTO_INCREMENT NOT NULL;


INSERT INTO `HistoricalIp` (`userId`, `ip`)
SELECT `userId`, `lastIp`
FROM `UserData`
WHERE `lastIp` IS NOT NULL;
