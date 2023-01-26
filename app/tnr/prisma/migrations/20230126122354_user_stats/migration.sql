-- CreateTable
CREATE TABLE `UserStats` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rank` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL,
    `strength` INTEGER NOT NULL,
    `intelligence` INTEGER NOT NULL,
    `willpower` INTEGER NOT NULL,
    `speed` INTEGER NOT NULL,
    `ninjutsu_offence` INTEGER NOT NULL,
    `ninjutsu_defence` INTEGER NOT NULL,
    `genjutsu_offence` INTEGER NOT NULL,
    `genjutsu_defence` INTEGER NOT NULL,
    `taijutsu_offence` INTEGER NOT NULL,
    `taijutsu_defence` INTEGER NOT NULL,
    `weapon_offence` INTEGER NOT NULL,
    `weapon_defence` INTEGER NOT NULL,
    `reputation_points` INTEGER NOT NULL,
    `popularity_points` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UserStats` ADD CONSTRAINT `UserStats_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
