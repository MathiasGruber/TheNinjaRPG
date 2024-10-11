CREATE TABLE `GameAsset` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	`type` enum('STATIC','ANIMATION') NOT NULL,
	`image` varchar(191) NOT NULL,
	`frames` tinyint NOT NULL DEFAULT 1,
	`speed` tinyint NOT NULL DEFAULT 1,
	`onInitialBattleField` boolean NOT NULL DEFAULT false,
	CONSTRAINT `GameAsset_id` PRIMARY KEY(`id`)
);
CREATE INDEX `GameAsset_type_idx` ON `GameAsset` (`type`);


INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('MrFfBZuReS', 'Rock_1_1', 'STATIC', 'https://utfs.io/f/f30d2908-d4e2-4b24-a93f-2374dad01f82-kv4miq.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('mGcnHCTmLC', 'Rock_1_2', 'STATIC', 'https://utfs.io/f/ba4f360d-c3db-45f5-93f5-f0d1af3c97b5-kv4mip.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('EnhTnINWzq', 'Rock_2_1', 'STATIC', 'https://utfs.io/f/c3ad24ce-526c-415f-af81-40074ac3b123-kv4ls1.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('IosljCeHhJ', 'Rock_2_2', 'STATIC', 'https://utfs.io/f/522f7a38-ecc1-4649-8a69-1038c4eb0c40-kv4ls0.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('xAd94Cpuri', 'Rock_5_1', 'STATIC', 'https://utfs.io/f/a8eda871-e51b-4164-a085-a17f4b48f53f-kv4jjy.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('pNLBSChjDR', 'Rock_5_2', 'STATIC', 'https://utfs.io/f/bd0c94a6-ded4-488b-ab57-765de4ca1574-kv4jjx.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('ZXA6AB6neb', 'Rock_6_1', 'STATIC', 'https://utfs.io/f/1dd9911f-fdff-44c5-a1bb-a8c40c03608a-kv4it9.png', '1');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`) VALUES ('7Xp1jT7wOm', 'Rock_6_2', 'STATIC', 'https://utfs.io/f/1ecdcbd7-4a6c-4baa-9298-dd384f32d860-kv4it8.png', '1');

INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('gkYHdSzsHu', 'Smoke', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJ0S3IOZsgrYldRWJcD6vE10SjNsXHeA9pVMfQ', '0', '9', '50');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('G762wnrRMS', 'Fire', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJ2ANLCfnMXlcRpYmJ5do0zKw4Qx6PVEtBa9b8', '0', '6', '50');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('yWD_e6iM1L', 'Rising Smoke', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJcmJw1PSnxBpQqGNDcTHbLmYz8uXAl3oa54ti', '0', '14', '50');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('I9aYhT5wMB', 'Heal', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJVO05n6F2veAXohUuE59nTQHRJIYjtiG18aF4', '0', '20', '50');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('FwJyve1Znr', 'Explosion', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJSOiKUg3jWrEB7TyZlmpoAxMK5Qi16kNPVJuH', '0', '10', '50');
INSERT INTO `GameAsset` (`id`, `name`, `type`, `image`, `onInitialBattleField`, `frames`, `speed`) VALUES ('oh4kVNrAwF', 'Hit', 'ANIMATION', 'https://utfs.io/f/Hzww9EQvYURJ6SgxSJDfT5pyNCaUruzhPtAJqb8Kj9mc1nlH', '0', '4', '50');