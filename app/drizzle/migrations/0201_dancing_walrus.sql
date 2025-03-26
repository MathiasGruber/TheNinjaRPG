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
ALTER TABLE `UserJutsu` ADD COLUMN `rankedEquipped` tinyint NOT NULL DEFAULT 0;
CREATE INDEX `Jutsu_rankedEquipped_idx` ON `UserJutsu` (`rankedEquipped`); 

CREATE TABLE "rankedUserJutsu" (
  "id" text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES "userData"("userId"),
  "jutsuId" text NOT NULL REFERENCES "jutsu"("id"),
  "level" integer NOT NULL DEFAULT 1,
  "experience" integer NOT NULL DEFAULT 0,
  "equipped" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

-- Create an index on userId for faster lookups
CREATE INDEX "rankedUserJutsu_userId_idx" ON "rankedUserJutsu"("userId");

-- Create a unique constraint to prevent duplicate jutsu entries for the same user
CREATE UNIQUE INDEX "rankedUserJutsu_userId_jutsuId_unique" ON "rankedUserJutsu"("userId", "jutsuId");
