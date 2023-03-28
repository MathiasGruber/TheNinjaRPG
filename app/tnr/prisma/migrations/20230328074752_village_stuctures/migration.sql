-- CreateTable
CREATE TABLE `VillageStructures` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `villageId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `max_level` INTEGER NOT NULL DEFAULT 10,
    `current_sp` INTEGER NOT NULL DEFAULT 100,
    `max_sp` INTEGER NOT NULL DEFAULT 100,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VillageStructures` ADD CONSTRAINT `VillageStructures_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `Village`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
