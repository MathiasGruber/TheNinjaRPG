CREATE TABLE `ContentTag` (
	`id` varchar(191) NOT NULL,
	`name` varchar(191) NOT NULL,
	CONSTRAINT `ContentTag_id` PRIMARY KEY(`id`),
	CONSTRAINT `ContentTag_name_key` UNIQUE(`name`)
);

CREATE TABLE `GameAssetTag` (
	`id` varchar(191) NOT NULL,
	`assetId` varchar(191) NOT NULL,
	`tagId` varchar(191) NOT NULL,
	CONSTRAINT `GameAssetTag_id` PRIMARY KEY(`id`),
	CONSTRAINT `GameAssetTag_assetId_tag_key` UNIQUE(`assetId`,`tagId`)
);
