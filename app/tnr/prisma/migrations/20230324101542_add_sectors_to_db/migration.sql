-- CreateTable
CREATE TABLE `MapSectors` (
    `id` VARCHAR(191) NOT NULL,
    `sector` INTEGER NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `z` DOUBLE NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
