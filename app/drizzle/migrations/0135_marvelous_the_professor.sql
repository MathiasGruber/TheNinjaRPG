ALTER TABLE `Village` ADD `joinable` boolean DEFAULT true NOT NULL;
ALTER TABLE `Village` ADD `villageLogo` varchar(191) DEFAULT '' NOT NULL;
ALTER TABLE `Village` ADD `villageGraphic` varchar(191) DEFAULT '' NOT NULL;

INSERT INTO `Village` (`id`, `name`, `sector`, `hexColor`, `createdAt`, `updatedAt`, `description`, `kageId`, `tokens`, `type`, `mapName`, `populationCount`, `joinable`)
VALUES
	('TDSh81zWX-Vqolk2WPFZe', 'Freedom State', 51, '#000000', '2024-09-08 13:44:50.636', '2024-09-08 13:44:50.636', '', 'deEX33e0XaynwxJDhlzIl', 0, 'VILLAGE', NULL, 0, 0);


UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/db2947cd-339a-4fc7-955e-6106dcb43ae9-ov2isn.png' WHERE `name` = 'Current'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/2eba0781-1d27-4c09-afa9-e003fb9ba0ce-tbi0en.png' WHERE `name` = 'Glacier'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/56e5bd7c-0b52-4b9f-808e-70aa6da90155-g7btv1.webp' WHERE `name` = 'Tsukimori'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/57b5625f-e146-46f0-b4df-a88e2d29e7e9-u33nun.png' WHERE `name` = 'Shroud'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/54dccbd6-00ba-4e41-bedc-9493976950ab-1bjkgb.png' WHERE `name` = 'Shine'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/6f9f4901-2a76-4fe7-a0eb-121d1936f313-t3bfgk.png' WHERE `name` = 'Syndicate'; 
UPDATE `Village` SET `villageLogo` = 'https://utfs.io/f/181962f9-7118-469e-8be0-b192531a8724-wh37d1.webp' WHERE `name` = 'Freedom State'; 

UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/28224c68-85f9-485a-a07b-132ff13238e2-ov2isn.webp' WHERE `name` = 'Current'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/2f69b76b-5743-44a1-ab85-2ca90a973893-tbi0en.webp' WHERE `name` = 'Glacier'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/4768cb6d-9962-4e90-aa3c-5b5e50250cc6-g7btv1.webp' WHERE `name` = 'Tsukimori'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/81cd6e9a-a5c8-4064-94f9-cf5c34dd902e-u33nun.webp' WHERE `name` = 'Shroud'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/9bebc815-ce5d-4588-995e-6484e309be1e-1bjkgb.webp' WHERE `name` = 'Shine'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/5b83da7e-9cce-4269-a017-57e6e4d2387f-t3bfgk.webp' WHERE `name` = 'Syndicate'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/ed58292f-4466-456c-9976-563f1ab7d930-wh37d1.webp' WHERE `name` = 'Freedom State'; 
UPDATE `Village` SET `villageGraphic` = 'https://utfs.io/f/19e939b5-6b5a-4f5f-af40-64e245a67cbc-h5z381.webp' WHERE `name` = 'Wake Island'; 

-- Freedom State
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/f28193c9-4ce5-42e0-b012-175e5e182159-og4jot.webp' WHERE `route` = '/missionhall' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/e31927e5-b4fd-4d04-a7f3-64a20b9b1c06-32ckib.webp' WHERE `route` = '/traininggrounds' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/e95af475-e935-4d64-9dfe-d779de22f343-egjw1h.webp' WHERE `route` = '/battlearena' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/f28193c9-4ce5-42e0-b012-175e5e182159-og4jot.webp' WHERE `route` = '/missionhall' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/9c1952a4-4266-4298-b5cb-da537ba8096d-2racum.webp' WHERE `route` = '/bank' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/6a13e8af-eff2-4a71-b06c-86ee2a5ee6d5-g14mij.webp' WHERE `route` = '/itemshop' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/0827ba5b-8b52-4952-a2e1-5f561e829865-8gou44.webp' WHERE `route` = '/hospital' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/0bfc75fd-f6be-444e-8d78-f86b1badbc5b-eplp2t.webp' WHERE `route` = '/ramenshop' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/fb38395d-c7a1-4a0d-b648-13ec2b6106ff-2reh4h.webp' WHERE `route` = '/home' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/0300dc72-55f0-43b2-96bf-ab4e86c853cc-rin5ah.webp' WHERE `route` = '/blackmarket' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';
UPDATE `VillageStructure` SET `image` = 'https://utfs.io/f/12f63fd0-b8b9-4671-931f-48bcd9b740ad-fw9z9f.webp' WHERE `route` = '/townhall' AND `villageId` = 'TDSh81zWX-Vqolk2WPFZe';

INSERT INTO `VillageStructure` (`id`, `name`, `image`, `villageId`, `level`, `maxLevel`, `curSp`, `maxSp`, `longitude`, `latitude`, `hasPage`, `anbuSquadsPerLvl`, `arenaRewardPerLvl`, `bankInterestPerLvl`, `blackDiscountPerLvl`, `clansPerLvl`, `hospitalSpeedupPerLvl`, `itemDiscountPerLvl`, `ramenDiscountPerLvl`, `regenIncreasePerLvl`, `sleepRegenPerLvl`, `structureDiscountPerLvl`, `trainBoostPerLvl`, `villageDefencePerLvl`, `patrolsPerLvl`, `baseCost`, `allyAccess`, `route`)
VALUES
	('crahRhfeqGA7r2r3pQmT9', 'Black Market', 'https://utfs.io/f/0300dc72-55f0-43b2-96bf-ab4e86c853cc-rin5ah.webp', 'TDSh81zWX-Vqolk2WPFZe', 0, 1, 100, 100, 14, 3, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/blackmarket'),
	('xOpV-OxpFxzEBpAmFgy2T', 'Administration Building', 'https://utfs.io/f/04c0d1af-22e3-4727-92be-89c30f8b2c67-9mpzas.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/adminbuilding'),
	('h_qpvTyo_HdM1sRhcfHRA', 'Hospital', 'https://utfs.io/f/0827ba5b-8b52-4952-a2e1-5f561e829865-8gou44.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 12, 8, 1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/hospital'),
	('L0x_hCgcxjut4ObXUcyb0', 'Protectors', 'https://utfs.io/f/0980ab97-1510-4202-982b-f5efa4dd0fdc-1m0.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1, 10000, 1, ''),
	('_XJkJ7L-cHiQ65sqxrAwg', 'Ramen Shop', 'https://utfs.io/f/0bfc75fd-f6be-444e-8d78-f86b1badbc5b-eplp2t.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 3, 8, 1, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 10000, 1, '/ramenshop'),
	('Vg4Wqp3iy7OrIl-ys6OCx', 'Town Hall', 'https://utfs.io/f/12f63fd0-b8b9-4671-931f-48bcd9b740ad-fw9z9f.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 7, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 10000, 1, '/townhall'),
	('1Zg3DLfCVDs-FLRX88I3D', 'Souvenirs Shop', 'https://utfs.io/f/35fead5e-ff14-411d-a3b2-d46f29d1253d-b4dgyz.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/souvenirs'),
	('ry2cwWIVivAvRmNsZj6MV', 'Science Building', 'https://utfs.io/f/5862365c-03b3-4f82-8b9a-5088066fc299-129rrd.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/science'),
	('Q8vykGiZlxo7bHbAt7wfd', 'Item shop', 'https://utfs.io/f/6a13e8af-eff2-4a71-b06c-86ee2a5ee6d5-g14mij.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 13, 11, 1, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/itemshop'),
	('BeOH5XT_7V1KkX96l-XRH', 'Bank', 'https://utfs.io/f/9c1952a4-4266-4298-b5cb-da537ba8096d-2racum.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 15, 10, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/bank'),
	('lTdBttvG-zg299pnS3RFC', 'Walls', 'https://utfs.io/f/b760b4ba-13c9-4273-8759-465520774d09-1dmc3t.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 10, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 10000, 1, ''),
	('N3U5uaHUuFN3pIekZo759', 'Training Grounds', 'https://utfs.io/f/e31927e5-b4fd-4d04-a7f3-64a20b9b1c06-32ckib.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 4, 5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 10000, 1, '/traininggrounds'),
	('XTB5QAZcQl0mu7LQWolnO', 'Battle Arena', 'https://utfs.io/f/e95af475-e935-4d64-9dfe-d779de22f343-egjw1h.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 7, 6, 1, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10000, 1, '/battlearena'),
	('ZShTaZzX3LEvQv4OZk-tr', 'Mission Hall', 'https://utfs.io/f/f28193c9-4ce5-42e0-b012-175e5e182159-og4jot.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 11, 10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 10000, 1, '/missionhall'),
	('k0qganjlDyAMzP51j1VBr', 'Home', 'https://utfs.io/f/fb38395d-c7a1-4a0d-b648-13ec2b6106ff-2reh4h.webp', 'TDSh81zWX-Vqolk2WPFZe', 1, 10, 100, 100, 4, 10, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 10000, 1, '/home');
