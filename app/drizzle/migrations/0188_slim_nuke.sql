CREATE TABLE `MedicalNinjaSquad` (
       `id` varchar(191) NOT NULL,
       `name` varchar(191) NOT NULL,
       `image` varchar(191) NOT NULL,
       `leaderId` varchar(191),
       `coLeaderId` varchar(191),
       `villageId` varchar(191) NOT NULL,
       `createdAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       `updatedAt` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
       CONSTRAINT `MedicalNinjaSquad_id` PRIMARY KEY(`id`),
       CONSTRAINT `MedicalNinjaSquad_name_key` UNIQUE(`name`)
);

ALTER TABLE `UserData` ADD `medicalNinjaSquadId` varchar(191);
ALTER TABLE `UserData` ADD `occupation` enum('NONE','MEDICAL_NINJA') DEFAULT 'NONE' NOT NULL;
CREATE INDEX `MedicalNinjaSquad_leaderId_idx` ON `MedicalNinjaSquad` (`leaderId`);
CREATE INDEX `MedicalNinjaSquad_villageId_idx` ON `MedicalNinjaSquad` (`villageId`);
