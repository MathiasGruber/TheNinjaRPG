-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Jutsu` MODIFY `jutsuType` ENUM('NORMAL', 'SPECIAL', 'BLOODLINE', 'FORBIDDEN', 'LOYALTY', 'CLAN', 'EVENT', 'AI') NOT NULL;
