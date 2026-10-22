-- Pause GameSetting writers while reconciling names and applying this constraint.
-- With PlanetScale deploy requests, reconcile data on the target branch before
-- deploying the unique schema: deploy requests do not copy branch row changes.
-- Preflight: SELECT name, COUNT(*) FROM GameSetting GROUP BY name HAVING COUNT(*) > 1;
-- Inspect all rows for each returned name and retain an export before reconciliation.
-- Only identical time/value pairs are safe to collapse automatically; id is not
-- referenced by other tables. Keep the smallest id without changing saved state.
DELETE duplicate FROM `GameSetting` AS duplicate
INNER JOIN `GameSetting` AS keeper
  ON duplicate.name = keeper.name
  AND duplicate.time = keeper.time
  AND duplicate.value = keeper.value
  AND duplicate.id > keeper.id;

-- A name with conflicting timestamps or values intentionally fails this ALTER.
-- Resolve those names according to their timer/configuration semantics before
-- retrying; never guess between a timer claim, rollback, boost expiry or staff value.
-- One ALTER retains the existing lookup index if the unique constraint fails.
ALTER TABLE `GameSetting`
  ADD CONSTRAINT `GameSetting_name_unique` UNIQUE (`name`),
  DROP INDEX `name`;
