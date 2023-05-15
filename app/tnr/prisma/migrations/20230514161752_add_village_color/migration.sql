-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE `Village` ADD COLUMN `hexColor` VARCHAR(191) NOT NULL DEFAULT '#000000';
