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
    `refresh_token_expires_in` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,

    INDEX `Account_userId_idx`(`userId`),
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
    INDEX `Session_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` TEXT NULL,
    `isBanned` BOOLEAN NOT NULL DEFAULT false,
    `role` ENUM('USER', 'MODERATOR', 'ADMIN') NOT NULL DEFAULT 'USER',

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
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
CREATE TABLE `UserData` (
    `userId` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `gender` VARCHAR(191) NOT NULL,
    `curHealth` INTEGER NOT NULL DEFAULT 100,
    `maxHealth` INTEGER NOT NULL DEFAULT 100,
    `curChakra` INTEGER NOT NULL DEFAULT 100,
    `maxChakra` INTEGER NOT NULL DEFAULT 100,
    `curStamina` INTEGER NOT NULL DEFAULT 100,
    `maxStamina` INTEGER NOT NULL DEFAULT 100,
    `regeneration` INTEGER NOT NULL DEFAULT 100,
    `money` INTEGER NOT NULL DEFAULT 100,
    `bank` INTEGER NOT NULL DEFAULT 100,
    `experience` INTEGER NOT NULL DEFAULT 0,
    `pvp_experience` INTEGER NOT NULL DEFAULT 0,
    `rank` VARCHAR(191) NOT NULL DEFAULT 'Student',
    `level` INTEGER NOT NULL DEFAULT 1,
    `villageId` VARCHAR(191) NULL,
    `bloodlineId` VARCHAR(191) NULL,
    `status` ENUM('AWAKE', 'TRAVEL', 'BATTLE') NOT NULL DEFAULT 'AWAKE',
    `strength` INTEGER NOT NULL DEFAULT 10,
    `intelligence` INTEGER NOT NULL DEFAULT 10,
    `willpower` INTEGER NOT NULL DEFAULT 10,
    `speed` INTEGER NOT NULL DEFAULT 10,
    `ninjutsuOffence` INTEGER NOT NULL DEFAULT 10,
    `ninjutsuDefence` INTEGER NOT NULL DEFAULT 10,
    `genjutsuOffence` INTEGER NOT NULL DEFAULT 10,
    `genjutsuDefence` INTEGER NOT NULL DEFAULT 10,
    `taijutsuOffence` INTEGER NOT NULL DEFAULT 10,
    `taijutsuDefence` INTEGER NOT NULL DEFAULT 10,
    `weapon_offence` INTEGER NOT NULL DEFAULT 10,
    `weapon_defence` INTEGER NOT NULL DEFAULT 10,
    `reputationPoints` INTEGER NOT NULL DEFAULT 0,
    `reputationPoints_total` INTEGER NOT NULL DEFAULT 0,
    `popularity_points` INTEGER NOT NULL DEFAULT 6,
    `popularity_points_total` INTEGER NOT NULL DEFAULT 6,
    `federalStatus` ENUM('NONE', 'NORMAL', 'SILVER', 'GOLD') NOT NULL DEFAULT 'NONE',
    `approved_tos` BOOLEAN NOT NULL DEFAULT false,
    `avatar` VARCHAR(191) NULL,
    `sector` INTEGER NOT NULL DEFAULT 0,
    `longitude` INTEGER NOT NULL DEFAULT 10,
    `latitude` INTEGER NOT NULL DEFAULT 7,
    `location` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deletionAt` DATETIME(3) NULL,
    `travelFinishAt` DATETIME(3) NULL,

    UNIQUE INDEX `UserData_userId_key`(`userId`),
    UNIQUE INDEX `UserData_username_key`(`username`),
    INDEX `UserData_bloodlineId_idx`(`bloodlineId`),
    INDEX `UserData_villageId_idx`(`villageId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserAttribute` (
    `id` VARCHAR(191) NOT NULL,
    `attribute` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `UserAttribute_userId_idx`(`userId`),
    UNIQUE INDEX `UserAttribute_attribute_userId_key`(`attribute`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HistoricalAvatar` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `avatar` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,

    INDEX `HistoricalAvatar_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Village` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sector` INTEGER NOT NULL DEFAULT 1,

    UNIQUE INDEX `Village_name_key`(`name`),
    UNIQUE INDEX `Village_sector_key`(`sector`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VillageStructure` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `image` VARCHAR(191) NOT NULL,
    `villageId` VARCHAR(191) NOT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `max_level` INTEGER NOT NULL DEFAULT 10,
    `cur_sp` INTEGER NOT NULL DEFAULT 100,
    `max_sp` INTEGER NOT NULL DEFAULT 100,

    INDEX `VillageStructure_villageId_idx`(`villageId`),
    UNIQUE INDEX `VillageStructure_name_villageId_key`(`name`, `villageId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Bloodline` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Bloodline_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BugReport` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `summary` VARCHAR(191) NOT NULL DEFAULT 'No summary provided',
    `system` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `is_resolved` BOOLEAN NOT NULL DEFAULT false,
    `popularity` INTEGER NOT NULL DEFAULT 0,
    `conversationId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `BugReport_conversationId_key`(`conversationId`),
    INDEX `BugReport_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BugVotes` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `value` TINYINT NOT NULL,
    `bugId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,

    INDEX `BugVotes_userId_idx`(`userId`),
    UNIQUE INDEX `BugVotes_bugId_userId_key`(`bugId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReportLog` (
    `id` VARCHAR(191) NOT NULL,
    `targetUserId` VARCHAR(191) NULL,
    `staffUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` VARCHAR(191) NOT NULL,

    INDEX `ReportLog_targetUserId_idx`(`targetUserId`),
    INDEX `ReportLog_staffUserId_idx`(`staffUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserReport` (
    `id` VARCHAR(191) NOT NULL,
    `reporterUserId` VARCHAR(191) NULL,
    `reportedUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `system` VARCHAR(191) NOT NULL,
    `infraction` JSON NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `banEnd` DATETIME(3) NULL,
    `adminResolved` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED') NOT NULL DEFAULT 'UNVIEWED',

    INDEX `UserReport_reporterUserId_idx`(`reporterUserId`),
    INDEX `UserReport_reportedUserId_idx`(`reportedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserReportComment` (
    `id` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `reportId` VARCHAR(191) NOT NULL,
    `decision` ENUM('UNVIEWED', 'REPORT_CLEARED', 'BAN_ACTIVATED', 'BAN_ESCALATED') NULL,

    INDEX `UserReportComment_userId_idx`(`userId`),
    INDEX `UserReportComment_reportId_idx`(`reportId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumBoard` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `summary` TEXT NOT NULL,
    `group` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `nPosts` INTEGER NOT NULL DEFAULT 0,
    `nThreads` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ForumBoard_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumThread` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `boardId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `nPosts` INTEGER NOT NULL DEFAULT 0,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ForumThread_boardId_idx`(`boardId`),
    INDEX `ForumThread_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ForumPost` (
    `id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `threadId` VARCHAR(191) NOT NULL,

    INDEX `ForumPost_userId_idx`(`userId`),
    INDEX `ForumPost_threadId_idx`(`threadId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Conversation` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isLocked` BOOLEAN NOT NULL DEFAULT false,
    `isPublic` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `Conversation_title_key`(`title`),
    INDEX `Conversation_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ConversationComment` (
    `id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `userId` VARCHAR(191) NOT NULL,
    `conversationId` VARCHAR(191) NULL,
    `isPinned` BOOLEAN NOT NULL DEFAULT false,

    INDEX `ConversationComment_userId_idx`(`userId`),
    INDEX `ConversationComment_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UsersInConversation` (
    `conversationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UsersInConversation_userId_idx`(`userId`),
    INDEX `UsersInConversation_conversationId_idx`(`conversationId`),
    PRIMARY KEY (`conversationId`, `userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaypalTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `affectedUserId` VARCHAR(191) NOT NULL,
    `transactionId` VARCHAR(191) NOT NULL,
    `transactionUpdatedDate` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `invoiceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `amount` DOUBLE NOT NULL DEFAULT 0,
    `reputationPoints` INTEGER NOT NULL DEFAULT 0,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
    `status` VARCHAR(191) NOT NULL,
    `rawData` JSON NOT NULL,

    UNIQUE INDEX `PaypalTransaction_orderId_key`(`orderId`),
    INDEX `PaypalTransaction_createdById_idx`(`createdById`),
    INDEX `PaypalTransaction_affectedUserId_idx`(`affectedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaypalSubscription` (
    `id` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `affectedUserId` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `federalStatus` ENUM('NONE', 'NORMAL', 'SILVER', 'GOLD') NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `subscriptionId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaypalSubscription_orderId_key`(`orderId`),
    UNIQUE INDEX `PaypalSubscription_subscriptionId_key`(`subscriptionId`),
    INDEX `PaypalSubscription_createdById_idx`(`createdById`),
    INDEX `PaypalSubscription_affectedUserId_idx`(`affectedUserId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaypalWebhookMessage` (
    `id` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `rawData` JSON NOT NULL,
    `handled` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
