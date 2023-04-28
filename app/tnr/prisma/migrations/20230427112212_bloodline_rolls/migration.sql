-- CreateTable
CREATE TABLE `BloodlineRolls` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bloodlineId` VARCHAR(191) NULL,
    `used` BOOLEAN NOT NULL DEFAULT false,

    INDEX `BloodlineRolls_bloodlineId_idx`(`bloodlineId`),
    INDEX `BloodlineRolls_userId_idx`(`userId`),
    UNIQUE INDEX `BloodlineRolls_userId_bloodlineId_key`(`userId`, `bloodlineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
