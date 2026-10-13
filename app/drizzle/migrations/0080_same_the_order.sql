ALTER TABLE `Item` MODIFY COLUMN `itemType` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER') NOT NULL;
ALTER TABLE `Item` MODIFY COLUMN `crystalTargetTypes` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER');
ALTER TABLE `Item` ADD `furnitureData` json;
ALTER TABLE `UserData` ADD `homeFurnitureRevision` int unsigned DEFAULT 0 NOT NULL;
ALTER TABLE `UserItem` ADD `homeX` double;
ALTER TABLE `UserItem` ADD `homeY` double;
ALTER TABLE `UserItem` ADD `homeRotation` tinyint unsigned DEFAULT 0 NOT NULL;

-- Starter fixtures belong to ordinary inventory. Import the furniture catalogue from
-- data/item.sql after schema deployment, then run this backfill before serving the app.
-- PlanetScale schema deploys do not run data statements. Repeating the backfill preserves
-- owned starter copies and placements, including copies granted during registration.
INSERT INTO `UserItem` (`id`, `userId`, `itemId`, `quantity`, `equipped`, `storedAtHome`, `homeX`, `homeY`, `homeRotation`)
SELECT
  SHA2(CONCAT('home-furniture:', `resident`.`userId`, ':', `starter`.`itemId`), 256),
  `resident`.`userId`, `starter`.`itemId`, 1, 'NONE', true, `starter`.`x`, `starter`.`y`, 0
FROM `UserData` AS `resident`
CROSS JOIN (
  SELECT 'home-bed' AS `itemId`, 22 AS `x`, 15.15 AS `y`
  UNION ALL SELECT 'home-armory', 75, 15.15
  UNION ALL SELECT 'home-kitchen', 76, 57.58
  UNION ALL SELECT 'home-garden', 86, 90.91
) AS `starter`
INNER JOIN `Item` AS `definition`
  ON `definition`.`id` = `starter`.`itemId` AND `definition`.`itemType` = 'FURNITURE'
WHERE NOT EXISTS (
  SELECT 1 FROM `UserItem` AS `owned`
  WHERE `owned`.`userId` = `resident`.`userId` AND `owned`.`itemId` = `starter`.`itemId`
)
ON DUPLICATE KEY UPDATE `id` = `UserItem`.`id`;
