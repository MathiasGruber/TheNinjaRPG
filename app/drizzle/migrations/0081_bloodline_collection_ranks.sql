-- Custom SQL migration file, put your code below! --
-- Preserve the audited collection achievements while replacing their rank fields.
-- ALL becomes an explicit D-through-S selection; H is selectable without a runtime exception.
-- Guards leave edited or already-migrated definitions alone. Keep objective IDs and
-- Quest.updatedAt unchanged so accepted quest versions and earned progress remain valid.
UPDATE `Quest`
SET `content` = JSON_REMOVE(
  JSON_SET(`content`, '$.objectives[0].bloodlineRanks',
    CASE JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].bloodlineRank'))
      WHEN 'ALL' THEN
        CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].excludeSRank')) = 'true'
          THEN JSON_ARRAY('D', 'C', 'B', 'A')
          ELSE JSON_ARRAY('D', 'C', 'B', 'A', 'S')
        END
      ELSE JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].bloodlineRank')))
    END
  ),
  '$.objectives[0].bloodlineRank', '$.objectives[0].excludeSRank'
)
WHERE JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].task')) = 'bloodline_collection'
  AND JSON_EXTRACT(`content`, '$.objectives[0].bloodlineRanks') IS NULL
  AND (`id`,
    JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].id')),
    JSON_UNQUOTE(JSON_EXTRACT(`content`, '$.objectives[0].bloodlineRank'))
  ) IN (
    ('-ox0s_IEnFE-PNg0LCSuc', 'bl677-H', 'H'),
    ('l3ZJjFP0_BiyawXjxVHqU', 'bl677-ALL', 'ALL'),
    ('n05YRB5bl5zUjwqMPBJSN', 'bl677-A', 'A'),
    ('pkkRYsVbB2Rs-V5Q9Kuod', 'bl677-B', 'B'),
    ('WhlFEtsIbCUq53L84FQo6', 'bl677-C', 'C'),
    ('wNOr8nnxzGQy3f3JFk9ch', 'bl677-S', 'S'),
    ('yUBrMxAvFnNMTIMdIqkWs', 'bl677-D', 'D')
  );
