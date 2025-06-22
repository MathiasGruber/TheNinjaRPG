-- Step 1: Add WAR_RAID to the enum while keeping FACTION_RAID
ALTER TABLE `War` MODIFY COLUMN `type` enum('VILLAGE_WAR','SECTOR_WAR','FACTION_RAID','WAR_RAID') NOT NULL;

-- Step 2: Update all existing FACTION_RAID records to WAR_RAID
UPDATE `War` SET `type` = 'WAR_RAID' WHERE `type` = 'FACTION_RAID';

-- Step 3: Remove FACTION_RAID from the enum
ALTER TABLE `War` MODIFY COLUMN `type` enum('VILLAGE_WAR','SECTOR_WAR','WAR_RAID') NOT NULL;