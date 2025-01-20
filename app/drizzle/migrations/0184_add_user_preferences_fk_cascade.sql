ALTER TABLE `UserPreferences`
ADD CONSTRAINT `UserPreferences_userId_fkey`
FOREIGN KEY (`userId`) REFERENCES `UserData` (`userId`) ON DELETE CASCADE;
