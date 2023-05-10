-- AlterTable
ALTER TABLE `BattleAction` MODIFY `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';
