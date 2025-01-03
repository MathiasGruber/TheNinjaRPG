RENAME TABLE `ReputationAward` TO `UserRewards`;
ALTER TABLE `UserRewards` RENAME COLUMN `amount` TO `reputationAmount`;
DROP INDEX `ReputationAward_awardedById_idx` ON `UserRewards`;
DROP INDEX `ReputationAward_receiverId_idx` ON `UserRewards`;
DROP INDEX `ReputationAward_createdAt_idx` ON `UserRewards`;
ALTER TABLE `UserRewards` DROP PRIMARY KEY;
ALTER TABLE `UserRewards` MODIFY COLUMN `reputationAmount` float NOT NULL DEFAULT 0;
ALTER TABLE `UserRewards` ADD PRIMARY KEY(`id`);
ALTER TABLE `UserRewards` ADD `moneyAmount` bigint DEFAULT 0 NOT NULL;
CREATE INDEX `UserRewards_awardedById_idx` ON `UserRewards` (`awardedById`);
CREATE INDEX `UserRewards_receiverId_idx` ON `UserRewards` (`receiverId`);
CREATE INDEX `UserRewards_createdAt_idx` ON `UserRewards` (`createdAt`);