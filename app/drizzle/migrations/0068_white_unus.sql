CREATE TABLE `UserReportEmbedding` (
	`reportId` varchar(191) NOT NULL,
	`sourceText` text NOT NULL,
	`model` varchar(191) NOT NULL,
	`embedding` VECTOR(1536) NOT NULL,
	CONSTRAINT `UserReportEmbedding_reportId` PRIMARY KEY(`reportId`)
);
