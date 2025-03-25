ALTER TABLE `UserData` ADD `rankedLp` INT DEFAULT 150 NOT NULL;
ALTER TABLE `BattleHistory` MODIFY COLUMN `battleType` ENUM('ARENA', 'COMBAT', 'SPARRING', 'KAGE_AI', 'KAGE_PVP', 'CLAN_CHALLENGE', 'CLAN_BATTLE', 'TOURNAMENT', 'QUEST', 'VILLAGE_PROTECTOR', 'TRAINING', 'RANKED') NOT NULL; 
CREATE TABLE RankedPvpQueue (
  id varchar(191) NOT NULL,
  userId varchar(191) NOT NULL,
  rankedLp int NOT NULL,
  createdAt datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  CONSTRAINT RankedPvpQueue_id PRIMARY KEY(id)
);
CREATE INDEX RankedPvpQueue_userId_idx ON RankedPvpQueue (userId);
CREATE INDEX RankedPvpQueue_rankedLp_idx ON RankedPvpQueue (rankedLp);
ALTER TABLE RankedPvpQueue ADD COLUMN queueStartTime timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE Battle MODIFY COLUMN battleType ENUM('ARENA', 'COMBAT', 'SPARRING', 'KAGE_AI', 'KAGE_PVP', 'CLAN_CHALLENGE', 'CLAN_BATTLE', 'TOURNAMENT', 'QUEST', 'VILLAGE_PROTECTOR', 'TRAINING', 'RANKED') NOT NULL;
ALTER TABLE DataBattleAction MODIFY COLUMN battleType ENUM('ARENA', 'COMBAT', 'SPARRING', 'KAGE_AI', 'KAGE_PVP', 'CLAN_CHALLENGE', 'CLAN_BATTLE', 'TOURNAMENT', 'QUEST', 'VILLAGE_PROTECTOR', 'TRAINING', 'RANKED') NOT NULL;
ALTER TABLE UserData ADD COLUMN rankedBattles int NOT NULL DEFAULT 0, ADD COLUMN rankedWins int NOT NULL DEFAULT 0, ADD COLUMN rankedStreak int NOT NULL DEFAULT 0; 
-- Create the ranked jutsu loadout table
CREATE TABLE `RankedJutsuLoadout` (
    `id` varchar(191) NOT NULL,
    `userId` varchar(191) NOT NULL,
    `jutsuIds` json NOT NULL,
    `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `RankedJutsuLoadout_userId_idx` (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add the ranked jutsu loadout reference to UserData
ALTER TABLE `UserData` 
ADD COLUMN `rankedJutsuLoadout` varchar(191),
ADD INDEX `UserData_rankedJutsuLoadout_idx` (`rankedJutsuLoadout`);

-- Add foreign key constraints
ALTER TABLE `RankedJutsuLoadout`
ADD CONSTRAINT `RankedJutsuLoadout_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `UserData`
ADD CONSTRAINT `UserData_rankedJutsuLoadout_fkey` FOREIGN KEY (`rankedJutsuLoadout`) REFERENCES `RankedJutsuLoadout`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
