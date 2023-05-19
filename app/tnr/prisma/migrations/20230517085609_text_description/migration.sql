-- AlterTable
ALTER TABLE `BattleAction` MODIFY `description` TEXT NOT NULL;

-- AlterTable
ALTER TABLE `Item` MODIFY `battleDescription` TEXT NOT NULL DEFAULT '';
