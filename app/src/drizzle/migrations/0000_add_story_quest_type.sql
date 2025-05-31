-- Add story quest type to Quest and QuestHistory tables
ALTER TABLE Quest MODIFY COLUMN questType ENUM('mission', 'crime', 'event', 'exam', 'errand', 'tier', 'daily', 'achievement', 'story') NOT NULL;
ALTER TABLE QuestHistory MODIFY COLUMN questType ENUM('mission', 'crime', 'event', 'exam', 'errand', 'tier', 'daily', 'achievement', 'story') NOT NULL; 