-- Custom SQL migration file, put your code below! --

-- Update quest content to migrate opponent_ai to opponentAIs array
-- Increase GROUP_CONCAT limit to handle large JSON data
SET SESSION group_concat_max_len = 1000000;

UPDATE Quest q1
JOIN (
  SELECT 
    q.id,
    CAST(CONCAT('[', GROUP_CONCAT(
      CASE 
        WHEN JSON_EXTRACT(obj.objective_data, '$.opponent_ai') IS NOT NULL 
             AND JSON_UNQUOTE(JSON_EXTRACT(obj.objective_data, '$.opponent_ai')) != '' THEN
          JSON_REMOVE(
            JSON_SET(
              obj.objective_data,
              '$.opponentAIs',
              JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(obj.objective_data, '$.opponent_ai')))
            ),
            '$.opponent_ai'
          )
        ELSE 
          obj.objective_data
      END
      SEPARATOR ','
    ), ']') AS JSON) as new_objectives
  FROM Quest q
  JOIN JSON_TABLE(
    q.content,
    '$.objectives[*]' COLUMNS (
      objective_data JSON PATH '$'
    )
  ) AS obj
  WHERE JSON_EXTRACT(q.content, '$.objectives') IS NOT NULL
    AND JSON_SEARCH(q.content, 'one', '%', NULL, '$.objectives[*].opponent_ai') IS NOT NULL
  GROUP BY q.id
) q2 ON q1.id = q2.id
SET q1.content = JSON_SET(q1.content, '$.objectives', q2.new_objectives);


UPDATE Quest q1
JOIN (
  SELECT 
    q.id,
    CAST(CONCAT('[', GROUP_CONCAT(
      CASE 
        WHEN JSON_EXTRACT(obj.objective_data, '$.collect_item_id') IS NOT NULL 
             AND JSON_UNQUOTE(JSON_EXTRACT(obj.objective_data, '$.collect_item_id')) != '' THEN
          JSON_REMOVE(
            JSON_SET(
              obj.objective_data,
              '$.collectItemIds',
              JSON_ARRAY(JSON_UNQUOTE(JSON_EXTRACT(obj.objective_data, '$.collect_item_id')))
            ),
            '$.collect_item_id'
          )
        ELSE 
          obj.objective_data
      END
      SEPARATOR ','
    ), ']') AS JSON) as new_objectives
  FROM Quest q
  JOIN JSON_TABLE(
    q.content,
    '$.objectives[*]' COLUMNS (
      objective_data JSON PATH '$'
    )
  ) AS obj
  WHERE JSON_EXTRACT(q.content, '$.objectives') IS NOT NULL
    AND JSON_SEARCH(q.content, 'one', '%', NULL, '$.objectives[*].collect_item_id') IS NOT NULL
  GROUP BY q.id
) q2 ON q1.id = q2.id
SET q1.content = JSON_SET(q1.content, '$.objectives', q2.new_objectives);

