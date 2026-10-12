ALTER TABLE `Item` MODIFY COLUMN `itemType` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER') NOT NULL;
ALTER TABLE `Item` MODIFY COLUMN `crystalTargetTypes` enum('WEAPON','CONSUMABLE','ARMOR','ACCESSORY','MATERIAL','COOKING','KEYSTONE','CRYSTAL','FURNITURE','OTHER');
ALTER TABLE `Item` ADD `furnitureAction` enum('sleep','storage','kitchen','farm');
ALTER TABLE `Item` ADD `furnitureWidth` double DEFAULT 24 NOT NULL;
ALTER TABLE `Item` ADD `furnitureGroundAnchor` double DEFAULT 100 NOT NULL;
ALTER TABLE `Item` ADD `furnitureIsFloor` boolean DEFAULT false NOT NULL;
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

-- One owned row per purchased decoration or starter fixture. Deterministic identifiers keep
-- a retried backfill from granting additional copies or overwriting a resident's arrangement.
-- The active home layout becomes the shared arrangement used after home upgrades.
-- Convert the former decorative/action projections to one floor projection, keeping edge
-- positions within the editor's bounds. Decorations absent from the active room stay unplaced.
INSERT INTO `UserItem` (`id`, `userId`, `itemId`, `quantity`, `equipped`, `storedAtHome`, `homeX`, `homeY`, `homeRotation`)
SELECT
  SHA2(CONCAT('home-furniture:', `source`.`userId`, ':', `source`.`itemId`), 256),
  `source`.`userId`,
  `source`.`itemId`,
  1,
  'NONE',
  true,
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(`source`.`activeLayout`, REPLACE(`source`.`placementPath`, '.id', '.x'))) + 0,
    `source`.`defaultX`
  ),
  COALESCE(
    LEAST(92, GREATEST(8, ROUND((
      0.5 * (JSON_UNQUOTE(JSON_EXTRACT(`source`.`activeLayout`, REPLACE(`source`.`placementPath`, '.id', '.y'))) + 0)
      + CASE WHEN `source`.`legacyId` = 'garden' THEN 14 ELSE 0 END
    ) / 0.66, 2))),
    `source`.`defaultY`
  ),
  COALESCE(
    JSON_UNQUOTE(JSON_EXTRACT(`source`.`activeLayout`, REPLACE(`source`.`placementPath`, '.id', '.rotation'))) + 0,
    0
  )
FROM (
  SELECT
    `resident`.`userId`,
    `stock`.`legacyId`,
    `stock`.`itemId`,
    `stock`.`defaultX`,
    `stock`.`defaultY`,
    `resident`.`activeLayout`,
    JSON_UNQUOTE(JSON_SEARCH(`resident`.`activeLayout`, 'one', `stock`.`legacyId`, NULL, '$[*].id')) AS `placementPath`
  FROM (
    SELECT
      `userId`,
      `homeFurniture`,
      JSON_EXTRACT(`homeFurniture`, CONCAT('$.layouts.', `homeType`)) AS `activeLayout`
    FROM `UserData`
  ) AS `resident`
  INNER JOIN (
    SELECT 'bed' AS `legacyId`, 'home-bed' AS `itemId`, 22 AS `defaultX`, 15.15 AS `defaultY`, 1 AS `isCore`
    UNION ALL
    SELECT 'armory', 'home-armory', 75, 15.15, 1
    UNION ALL
    SELECT 'kitchen', 'home-kitchen', 76, 57.58, 1
    UNION ALL
    SELECT 'garden', 'home-garden', 86, 90.91, 1
    UNION ALL
    SELECT 'rug', 'home-rug', NULL, NULL, 0
    UNION ALL
    SELECT 'table', 'home-table', NULL, NULL, 0
    UNION ALL
    SELECT 'bookshelf', 'home-bookshelf', NULL, NULL, 0
    UNION ALL
    SELECT 'lantern', 'home-lantern', NULL, NULL, 0
    UNION ALL
    SELECT 'bonsai', 'home-bonsai', NULL, NULL, 0
    UNION ALL
    SELECT 'sofa', 'home-sofa', NULL, NULL, 0
    UNION ALL
    SELECT 'screen', 'home-screen', NULL, NULL, 0
    UNION ALL
    SELECT 'pond', 'home-pond', NULL, NULL, 0
  ) AS `stock`
    ON `stock`.`isCore` = 1
      OR JSON_CONTAINS(JSON_EXTRACT(`resident`.`homeFurniture`, '$.owned'), JSON_QUOTE(`stock`.`legacyId`))
) AS `source`
INNER JOIN `Item` AS `definition`
  ON `definition`.`id` = `source`.`itemId` AND `definition`.`itemType` = 'FURNITURE'
ON DUPLICATE KEY UPDATE `id` = `UserItem`.`id`;

-- Ownership and active placement have been copied into inventory before removing the JSON.
ALTER TABLE `UserData` DROP COLUMN `homeFurniture`;
