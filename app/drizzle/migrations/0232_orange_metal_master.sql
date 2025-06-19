-- Custom SQL migration file, put your code below! --

-- This migration updates the structure of the `opponentAIs` field that lives
-- inside every objective in the Quest.content JSON column.
--
-- Previous structure (per objective):
--   "opponentAIs": ["ai_id_1", "ai_id_2", ...]
-- New structure (per objective):
--   "opponentAIs": [ { "ids": ["ai_id_1", "ai_id_2", ...], "number": 1 } ]
--
-- The migration keeps the exact list of ids and wraps them inside a single
-- object with a default `number` value of 1 so that existing gameplay logic
-- continues to spawn one instance of any of the listed AIs – mirroring the
-- behaviour prior to this change.
--
-- The statement below performs the following for every Quest row:
--   1. Iterates over every objective in `content.objectives` using JSON_TABLE
--   2. Detects objectives where `opponentAIs` is an array of strings (old
--      format) by checking that the first element is of JSON type STRING.
--   3. Re-writes that objective, replacing the old array with the new array
--      containing an object { ids: <old_array>, number: 1 }.
--   4. Re-assembles the objectives array and writes it back to the
--      Quest.content JSON column.
--
-- NOTE: This query is written for PlanetScale / Vitess MySQL 8.x and uses only
--       standard MySQL JSON functions.

-- Increase concat limit to cope with large JSON payloads
SET SESSION group_concat_max_len = 100000000;

UPDATE Quest q
JOIN (
  SELECT
    q.id,
    CONCAT('[', GROUP_CONCAT(obj.updated_objective ORDER BY obj.idx SEPARATOR ','), ']') AS new_objectives
  FROM Quest q
  JOIN (
    SELECT
      q.id,
      obj.idx,
      -- Transform opponentAIs only when it is in the old format (array of strings)
      CASE
        WHEN JSON_TYPE(JSON_EXTRACT(obj.objective, '$.opponentAIs[0]')) = 'STRING' THEN
          JSON_SET(
            obj.objective,
            '$.opponentAIs',
            JSON_ARRAY(
              JSON_OBJECT(
                'ids', JSON_EXTRACT(obj.objective, '$.opponentAIs'),
                'number', 1
              )
            )
          )
        ELSE obj.objective
      END AS updated_objective
    FROM Quest q
    -- Expand objectives array
    JOIN JSON_TABLE(
      q.content,
      '$.objectives[*]' COLUMNS (
        idx FOR ORDINALITY,
        objective JSON PATH '$'
      )
    ) obj ON TRUE
  ) obj ON q.id = obj.id
  GROUP BY q.id
) q2 ON q.id = q2.id
-- Write back the transformed objectives array
SET q.content = JSON_SET(q.content, '$.objectives', CAST(q2.new_objectives AS JSON));

-- ------------------------------------------------------------------
-- MIGRATION: Convert `attackers` (array of strings) -> array of objects
-- ------------------------------------------------------------------
-- Previous structure within an objective:
--   "attackers": ["ai_id_1", "ai_id_2", ...],
--   "attackers_chance": 50
-- New structure:
--   "attackers": [ { "ids": ["ai_id_1", "ai_id_2", ...], "number": 50 } ]
--   (and `attackers_chance` key removed)
--
-- The value of the former `attackers_chance` field is stored in the `number`
-- property of the newly-created attacker object. If `attackers_chance` is
-- missing or null we default to 1.

-- Ensure large objectives payloads are not truncated
SET SESSION group_concat_max_len = 100000000;

UPDATE Quest q
JOIN (
  SELECT
    q.id,
    CONCAT('[', GROUP_CONCAT(obj.updated_objective ORDER BY obj.idx SEPARATOR ','), ']') AS new_objectives
  FROM Quest q
  JOIN (
    SELECT
      q.id,
      obj.idx,
      -- Transform attackers only when it is in the old format (array of strings)
      CASE
        WHEN JSON_TYPE(JSON_EXTRACT(obj.objective, '$.attackers[0]')) = 'STRING' THEN
          -- Build new attackers array and drop attackers_chance
          JSON_REMOVE(
            JSON_SET(
              obj.objective,
              '$.attackers',
              JSON_ARRAY(
                JSON_OBJECT(
                  'ids', JSON_EXTRACT(obj.objective, '$.attackers'),
                  'number', IFNULL(
                    CAST(JSON_UNQUOTE(JSON_EXTRACT(obj.objective, '$.attackers_chance')) AS DECIMAL(10,4)),
                    1
                  )
                )
              )
            ),
            '$.attackers_chance'
          )
        ELSE obj.objective
      END AS updated_objective
    FROM Quest q
    -- Expand objectives array
    JOIN JSON_TABLE(
      q.content,
      '$.objectives[*]' COLUMNS (
        idx FOR ORDINALITY,
        objective JSON PATH '$'
      )
    ) obj ON TRUE
  ) obj ON q.id = obj.id
  GROUP BY q.id
) q2 ON q.id = q2.id
-- Write back the transformed objectives array
SET q.content = JSON_SET(q.content, '$.objectives', CAST(q2.new_objectives AS JSON));

-- ------------------------------------------------------------------
-- MIGRATION: Convert `reward_items` arrays -> array of objects (objectives)
-- ------------------------------------------------------------------
-- Previous objective structure:
--   "reward_items": ["item_id_1", "item_id_2", ...]
-- New objective structure:
--   "reward_items": [ { "ids": ["item_id_1", "item_id_2", ...], "number": 100 } ]
--
-- We set `number` to 100 for all migrated rows (100% drop chance).

-- Ensure large objectives payloads are not truncated
SET SESSION group_concat_max_len = 100000000;

UPDATE Quest q
JOIN (
  SELECT
    q.id,
    CONCAT('[', GROUP_CONCAT(obj.updated_objective ORDER BY obj.idx SEPARATOR ','), ']') AS new_objectives
  FROM Quest q
  JOIN (
    SELECT
      q.id,
      obj.idx,
      CASE
        WHEN JSON_TYPE(JSON_EXTRACT(obj.objective, '$.reward_items[0]')) = 'STRING' THEN
          JSON_SET(
            obj.objective,
            '$.reward_items',
            JSON_ARRAY(
              JSON_OBJECT(
                'ids', JSON_EXTRACT(obj.objective, '$.reward_items'),
                'number', 100
              )
            )
          )
        ELSE obj.objective
      END AS updated_objective
    FROM Quest q
    -- Expand objectives array
    JOIN JSON_TABLE(
      q.content,
      '$.objectives[*]' COLUMNS (
        idx FOR ORDINALITY,
        objective JSON PATH '$'
      )
    ) obj ON TRUE
  ) obj ON q.id = obj.id
  GROUP BY q.id
) q2 ON q.id = q2.id
-- Write back the transformed objectives array
SET q.content = JSON_SET(q.content, '$.objectives', CAST(q2.new_objectives AS JSON));

-- ------------------------------------------------------------------
-- MIGRATION: Convert `content.reward.reward_items` arrays -> new structure
-- ------------------------------------------------------------------
-- Update the top-level quest reward the same way.

UPDATE Quest q
SET q.content = JSON_SET(
  q.content,
  '$.reward.reward_items',
  JSON_ARRAY(
    JSON_OBJECT(
      'ids', JSON_EXTRACT(q.content, '$.reward.reward_items'),
      'number', 100
    )
  )
)
WHERE JSON_TYPE(JSON_EXTRACT(q.content, '$.reward.reward_items[0]')) = 'STRING';


