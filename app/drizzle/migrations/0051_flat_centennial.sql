CREATE TABLE `CpaLeadConversion` (
	`id` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`campaignId` varchar(191) NOT NULL,
	`campaignName` varchar(191) NOT NULL,
	`payout` int NOT NULL,
	`ipAddress` varchar(191) NOT NULL,
	`gatewayId` varchar(191) NOT NULL,
	`leadId` varchar(191) NOT NULL,
	`countryIso` varchar(10) NOT NULL,
	`virtualCurrency` int NOT NULL,
	CONSTRAINT `CpaLeadConversion_id` PRIMARY KEY(`id`)
);

CREATE INDEX `CpaLeadConversion_userId_idx` ON `CpaLeadConversion` (`userId`);
CREATE INDEX `CpaLeadConversion_campaignId_idx` ON `CpaLeadConversion` (`campaignId`);
CREATE INDEX `CpaLeadConversion_leadId_idx` ON `CpaLeadConversion` (`leadId`);