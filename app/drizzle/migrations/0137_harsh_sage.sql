-- Custom SQL migration file, put you code below! --
UPDATE ActionLog SET `tableName` = 'user' WHERE `tableName` = 'userData';