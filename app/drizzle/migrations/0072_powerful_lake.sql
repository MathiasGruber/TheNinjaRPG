ALTER TABLE `Notification` ADD `warId` varchar(191);
ALTER TABLE `War` ADD `settlement` json;
ALTER TABLE `War` ADD `settlementPending` boolean DEFAULT false NOT NULL;
ALTER TABLE `WarAlly` ADD `acceptedAt` datetime(3) DEFAULT (CURRENT_TIMESTAMP(3));
ALTER TABLE `WarAlly` ADD `endedAt` datetime(3);
ALTER TABLE `WarAlly` ADD `activeVillageId` varchar(191) GENERATED ALWAYS AS (CASE WHEN `endedAt` IS NULL THEN `villageId` ELSE NULL END) STORED;
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_warId_key` UNIQUE(`warId`);
-- Preserve prior membership records while retaining one active row per village.
UPDATE `WarAlly` duplicateAlly
INNER JOIN `WarAlly` retainedAlly ON retainedAlly.warId = duplicateAlly.warId
  AND retainedAlly.villageId = duplicateAlly.villageId AND retainedAlly.id < duplicateAlly.id
SET duplicateAlly.endedAt = CURRENT_TIMESTAMP(3)
WHERE duplicateAlly.endedAt IS NULL;
ALTER TABLE `WarAlly` ADD CONSTRAINT `WarAlly_active_village_key` UNIQUE(`warId`,`activeVillageId`);
CREATE INDEX `War_settlementPending_idx` ON `War` (`settlementPending`);
