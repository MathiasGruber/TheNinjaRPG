ALTER TABLE Quest
ADD COLUMN prerequisiteQuestId varchar(191) NULL,
ADD INDEX Quest_prerequisiteQuestId_idx (prerequisiteQuestId); 