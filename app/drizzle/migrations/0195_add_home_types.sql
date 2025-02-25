CREATE TABLE `HomeType` (
  `id` varchar(191) PRIMARY KEY NOT NULL,
  `name` varchar(191) NOT NULL,
  `regenBonus` int NOT NULL,
  `storageSlots` int NOT NULL,
  `cost` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  `updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3))
);

CREATE TABLE `UserHome` (
  `id` varchar(191) PRIMARY KEY NOT NULL,
  `userId` varchar(191) NOT NULL,
  `homeTypeId` varchar(191) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  `updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  INDEX `UserHome_userId_idx` (`userId`),
  INDEX `UserHome_homeTypeId_idx` (`homeTypeId`)
  -- Optionally, add foreign key constraints if desired:
  -- FOREIGN KEY (`userId`) REFERENCES `UserData`(`userId`),
  -- FOREIGN KEY (`homeTypeId`) REFERENCES `HomeType`(`id`)
);

CREATE TABLE `UserHomeStorage` (
  `id` varchar(191) PRIMARY KEY NOT NULL,
  `userHomeId` varchar(191) NOT NULL,
  `itemId` varchar(191) NOT NULL,
  `slot` int NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  `updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
  INDEX `UserHomeStorage_userHomeId_idx` (`userHomeId`),
  INDEX `UserHomeStorage_slot_idx` (`slot`)
  -- Optionally, add a foreign key:
  -- FOREIGN KEY (`userHomeId`) REFERENCES `UserHome`(`id`)
);

INSERT INTO `HomeType` (`id`, `name`, `regenBonus`, `storageSlots`, `cost`)
VALUES
  ('one-bed-apartment', 'One Bed Room Apartment', 20, 5, 3000000),
  ('studio-apartment', 'Studio Apartment', 30, 10, 7000000),
  ('two-bed-house', 'Two Bed Room House', 40, 15, 13000000),
  ('town-house', 'Town House', 50, 20, 30000000),
  ('small-mansion', 'Small Mansion', 60, 25, 40000000),
  ('small-estate', 'Small Estate', 70, 30, 50000000),
  ('large-estate', 'Large Estate', 100, 40, 70000000);
