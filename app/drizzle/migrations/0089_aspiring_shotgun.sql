CREATE TABLE `UserHome` (
	`userId` varchar(191) NOT NULL,
	`roomStyles` json NOT NULL DEFAULT ('[]'),
	`isPublic` boolean NOT NULL DEFAULT false,
	CONSTRAINT `UserHome_userId` PRIMARY KEY(`userId`)
);

ALTER TABLE `UserRequest` MODIFY COLUMN `type` enum('SPAR','ALLIANCE','SURRENDER','SENSEI','ANBU','CLAN','MARRIAGE','KAGE','WAR_ALLY','HOME') NOT NULL;
ALTER TABLE `UserRequest` ADD `activeHomeReceiverId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `type` = 'HOME' AND `status` IN ('PENDING', 'ACCEPTED') THEN `receiverId` ELSE NULL END) STORED;
ALTER TABLE `UserRequest` ADD CONSTRAINT `UserRequest_active_home_pair_unique` UNIQUE(`senderId`,`activeHomeReceiverId`);
-- Copy only customized settings; an absent row is the private, original-finish default.
INSERT INTO `UserHome` (`userId`, `roomStyles`, `isPublic`)
SELECT `userId`, `homeRoomStyles`, `homePublic` FROM `UserData`
WHERE JSON_LENGTH(`homeRoomStyles`) > 0 OR `homePublic` = true;

-- Existing grants stay accepted. A bounded index set expands the former 100-entry list
-- using MySQL JSON extraction without requiring JSON_TABLE support from the SQL gateway.
INSERT INTO `UserRequest` (`id`, `senderId`, `receiverId`, `status`, `type`)
SELECT CONCAT('home-', SHA2(CONCAT(u.`userId`, ':', recipient.`userId`), 256)),
       u.`userId`, recipient.`userId`, 'ACCEPTED', 'HOME'
FROM `UserData` u
INNER JOIN (
  SELECT ones.n + tens.n * 10 AS n FROM
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) ones
  CROSS JOIN
    (SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) tens
) positions ON positions.n < JSON_LENGTH(u.`homeInvitations`)
INNER JOIN `UserData` recipient ON recipient.`userId` = JSON_UNQUOTE(JSON_EXTRACT(u.`homeInvitations`, CONCAT('$[', positions.n, '].userId')))
WHERE u.`userId` <> recipient.`userId`
ON DUPLICATE KEY UPDATE `id` = `UserRequest`.`id`;

ALTER TABLE `UserData` DROP COLUMN `homeRoomStyles`;
ALTER TABLE `UserData` DROP COLUMN `homePublic`;
ALTER TABLE `UserData` DROP COLUMN `homeInvitations`;