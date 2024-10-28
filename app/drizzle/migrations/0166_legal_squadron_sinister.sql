ALTER TABLE `UserReport` ADD `aiInterpretation` text NOT NULL;
ALTER TABLE UserReport ADD FULLTEXT INDEX full_text_content_idx (aiInterpretation);