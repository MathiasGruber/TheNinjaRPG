ALTER TABLE `Item` MODIFY COLUMN `itemType` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER') NOT NULL;
ALTER TABLE `Item` MODIFY COLUMN `crystalTargetTypes` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER');
ALTER TABLE `Item` ADD `furnitureAction` enum('sleep','storage','kitchen','farm');
ALTER TABLE `Item` ADD `furnitureWidth` double DEFAULT 24 NOT NULL;
ALTER TABLE `Item` ADD `furnitureGroundAnchor` double DEFAULT 100 NOT NULL;
ALTER TABLE `Item` ADD `furnitureIsFloor` boolean DEFAULT false NOT NULL;
ALTER TABLE `UserData` ADD `homeFurnitureRevision` int unsigned DEFAULT 0 NOT NULL;
ALTER TABLE `UserItem` ADD `homeX` double;
ALTER TABLE `UserItem` ADD `homeY` double;
ALTER TABLE `UserItem` ADD `homeRotation` tinyint unsigned DEFAULT 0 NOT NULL;

-- Furnishings use the ordinary content catalogue; duplicate seeds preserve staff edits.
INSERT INTO `Item` (`slot`, `target`, `method`, `weaponType`, `coordinateTargeting`, `effects`, `battleDescription`, `maxEquips`, `preventBattleUsage`, `destroyOnUse`, `canStack`, `stackSize`, `maxImbueNumber`, `maxDurability`, `canBeImbued`, `range`, `cooldown`, `chakraCost`, `staminaCost`, `healthCost`, `chakraCostReducePerLvl`, `staminaCostReducePerLvl`, `healthCostReducePerLvl`, `actionCostPerc`, `parentItemId`, `bloodlineId`, `requiredSkillId`, `crystalTargetTypes`, `isFarmSeed`, `isFarmFertilizer`, `farmSellValue`, `itemType`, `rarity`, `hidden`, `inShop`, `canBeTraded`, `id`, `name`, `description`, `image`, `cost`, `furnitureWidth`, `furnitureGroundAnchor`, `furnitureAction`, `furnitureIsFloor`)
VALUES
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, false, false, 'home-bed', 'Bed', 'Rest here to sleep or wake up.', '/images/home/furniture/bed.webp', 0, 34.0, 91.1, 'sleep', false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, false, false, 'home-armory', 'Armory', 'Open your home storage.', '/images/home/furniture/armory.webp', 0, 24.0, 95.8, 'storage', false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, false, false, 'home-kitchen', 'Kitchen', 'Visit the ramen shop while cooking is being prepared.', '/images/home/furniture/kitchen.webp', 0, 32.0, 89.1, 'kitchen', false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, false, false, 'home-garden', 'Garden', 'Visit your farm.', '/images/home/furniture/garden.webp', 0, 29.0, 88.3, 'farm', false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-rug', 'Woven Rug', 'A warm woven accent for your floor.', '/images/home/furniture/rug.webp', 25000, 25.0, 88.5, NULL, true),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-table', 'Tea Table', 'A low wooden table for quiet moments.', '/images/home/furniture/table.webp', 50000, 19.0, 90.3, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-bookshelf', 'Bookshelf', 'Keep your favorite stories close at hand.', '/images/home/furniture/bookshelf.webp', 75000, 19.0, 89.6, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-lantern', 'Paper Lantern', 'A soft light for your home.', '/images/home/furniture/lantern.webp', 30000, 13.0, 93.6, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-bonsai', 'Bonsai', 'A carefully tended miniature tree.', '/images/home/furniture/bonsai.webp', 40000, 16.0, 95.9, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-sofa', 'Sofa', 'A comfortable place to unwind.', '/images/home/furniture/sofa.webp', 100000, 26.0, 88.4, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-screen', 'Folding Screen', 'Divide your room with a wooden screen.', '/images/home/furniture/screen.webp', 80000, 24.0, 86.6, NULL, false),
  ('NONE', 'SELF', 'SINGLE', 'NONE', NULL, JSON_ARRAY(), '', 0, true, false, false, 1, 0, 0, false, 0, 0, 0, 0, 0, 0, 0, 0, 100, NULL, NULL, NULL, NULL, false, false, 0, 'FURNITURE', 'COMMON', false, true, true, 'home-pond', 'Stone Pond', 'A peaceful water feature for your home.', '/images/home/furniture/pond.webp', 150000, 25.0, 85.8, NULL, false)
ON DUPLICATE KEY UPDATE `id` = `Item`.`id`;

-- Deterministic starter identifiers make repeat grants preserve the owned copy and its placement.
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
WHERE true -- Disambiguate the JOIN from INSERT's ON DUPLICATE KEY clause.
ON DUPLICATE KEY UPDATE `id` = `UserItem`.`id`;
