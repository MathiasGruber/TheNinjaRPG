-- MERGE TWO VILLAGES; Konoki & Silence;  --
-- Convert all Silence to Konoki, Rename Konoki to Tsukimori, Delete Silence --

-- UPDATE AnbuSquad SET villageId = 'Konoki' WHERE villageId = 'Silence';
-- UPDATE Bloodline SET village = 'Konoki' WHERE village = 'Silence';
-- UPDATE Clan SET villageId = 'Konoki' WHERE villageId = 'Silence';
-- UPDATE Jutsu SET villageId = 'Konoki' WHERE villageId = 'Silence';
-- UPDATE UserData SET villageId = 'Konoki' WHERE villageId = 'Silence';
-- DELETE FROM VillageStructure WHERE villageId = 'Silence';
-- DELETE FROM VillageAlliance WHERE villageIdA = 'Silence' OR villageIdB = 'Silence';
-- UPDATE KageDefendedChallenges SET villageId = 'Konoki' WHERE villageId = 'Silence';
-- UPDATE Quest SET requiredVillage = 'Konoki' WHERE requiredVillage = 'Silence';
-- UPDATE Village SET name = 'Tsukimori' WHERE name = 'Konoki';
-- UPDATE UserData SET sector = 305 WHERE villageId = 'Konoki';
-- DELETE FROM Village WHERE id = 'Silence'
-- UPDATE UserData SET sector = 305 WHERE villageId = 'Konoki';
-- UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/3c890cf9-7333-467a-82f3-ef6da9cf6f87-jmcpod.webp' WHERE `route` = '/townhall' AND `villageId` = 'Konoki';

UPDATE AnbuSquad SET villageId = 'clh4d6sha0018tb0hrer16kv5' WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
UPDATE Bloodline SET village = 'clh4d6sha0018tb0hrer16kv5' WHERE village = 'clh4d6spx001ktb0h08zlzsky';
UPDATE Clan SET villageId = 'clh4d6sha0018tb0hrer16kv5' WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
UPDATE Jutsu SET villageId = 'clh4d6sha0018tb0hrer16kv5' WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
UPDATE UserData SET villageId = 'clh4d6sha0018tb0hrer16kv5' WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
DELETE FROM VillageStructure WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
DELETE FROM VillageAlliance WHERE villageIdA = 'clh4d6spx001ktb0h08zlzsky' OR villageIdB = 'clh4d6spx001ktb0h08zlzsky';
UPDATE KageDefendedChallenges SET villageId = 'clh4d6sha0018tb0hrer16kv5' WHERE villageId = 'clh4d6spx001ktb0h08zlzsky';
UPDATE Quest SET requiredVillage = 'clh4d6sha0018tb0hrer16kv5' WHERE requiredVillage = 'clh4d6spx001ktb0h08zlzsky';
UPDATE Village SET name = 'Tsukimori', hexColor='#B22222' WHERE name = 'clh4d6sha0018tb0hrer16kv5';
DELETE FROM Village WHERE id = 'clh4d6spx001ktb0h08zlzsky'
UPDATE UserData SET sector = 305 WHERE villageId = 'clh4d6sha0018tb0hrer16kv5';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/3c890cf9-7333-467a-82f3-ef6da9cf6f87-jmcpod.webp' WHERE `route` = '/townhall' AND `villageId` = 'clh4d6sha0018tb0hrer16kv5';