ALTER TABLE `PetSpecies` ADD `artDirection` varchar(1000);
ALTER TABLE `PetSpecies` ADD `rankConcepts` json DEFAULT ('[]') NOT NULL;