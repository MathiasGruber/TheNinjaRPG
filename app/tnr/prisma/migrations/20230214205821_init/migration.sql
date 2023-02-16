-- CreateTable
CREATE TABLE `Example` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserData` (
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `gender` VARCHAR(191) NOT NULL,
    `cur_health` INTEGER NOT NULL DEFAULT 100,
    `max_health` INTEGER NOT NULL DEFAULT 100,
    `cur_chakra` INTEGER NOT NULL DEFAULT 100,
    `max_chakra` INTEGER NOT NULL DEFAULT 100,
    `cur_stamina` INTEGER NOT NULL DEFAULT 100,
    `max_stamina` INTEGER NOT NULL DEFAULT 100,
    `regeneration` INTEGER NOT NULL DEFAULT 100,
    `money` INTEGER NOT NULL DEFAULT 100,
    `bank` INTEGER NOT NULL DEFAULT 100,
    `experience` INTEGER NOT NULL DEFAULT 0,
    `pvp_experience` INTEGER NOT NULL DEFAULT 0,
    `rank` VARCHAR(191) NOT NULL DEFAULT 'Student',
    `level` INTEGER NOT NULL DEFAULT 1,
    `villageId` VARCHAR(191) NULL,
    `bloodlineId` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Awake',
    `strength` INTEGER NOT NULL DEFAULT 10,
    `intelligence` INTEGER NOT NULL DEFAULT 10,
    `willpower` INTEGER NOT NULL DEFAULT 10,
    `speed` INTEGER NOT NULL DEFAULT 10,
    `ninjutsu_offence` INTEGER NOT NULL DEFAULT 10,
    `ninjutsu_defence` INTEGER NOT NULL DEFAULT 10,
    `genjutsu_offence` INTEGER NOT NULL DEFAULT 10,
    `genjutsu_defence` INTEGER NOT NULL DEFAULT 10,
    `taijutsu_offence` INTEGER NOT NULL DEFAULT 10,
    `taijutsu_defence` INTEGER NOT NULL DEFAULT 10,
    `weapon_offence` INTEGER NOT NULL DEFAULT 10,
    `weapon_defence` INTEGER NOT NULL DEFAULT 10,
    `reputation_points` INTEGER NOT NULL DEFAULT 0,
    `popularity_points` INTEGER NOT NULL DEFAULT 1,
    `approved_tos` BOOLEAN NOT NULL DEFAULT false,
    `avatar` VARCHAR(191) NULL,

    UNIQUE INDEX `UserData_userId_key`(`userId`),
    UNIQUE INDEX `UserData_username_key`(`username`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAttribute` (
    `id` VARCHAR(191) NOT NULL,
    `attribute` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalAvatar` (
    `id` VARCHAR(191) NOT NULL,
    `avatar` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Village` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `longitude` INTEGER NOT NULL,
    `latitude` INTEGER NOT NULL,

    UNIQUE INDEX `Village_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bloodline` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Bloodline_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserData` ADD CONSTRAINT `UserData_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserData` ADD CONSTRAINT `UserData_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `Village`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserData` ADD CONSTRAINT `UserData_bloodlineId_fkey` FOREIGN KEY (`bloodlineId`) REFERENCES `Bloodline`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserAttribute` ADD CONSTRAINT `UserAttribute_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HistoricalAvatar` ADD CONSTRAINT `HistoricalAvatar_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
