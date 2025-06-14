-- Custom SQL migration file, put your code below! --

-- Set a high group_concat_max_len to handle large JSON arrays
SET SESSION group_concat_max_len = 1000000;

-- For each quest, update the objectives array so that each objective (except the last) gets a nextObjectiveId field set to the id of the next objective. The last objective's nextObjectiveId is set to null (or removed).

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
      -- If not last, set nextObjectiveId to next objective's id; else, remove nextObjectiveId
      CASE
        WHEN obj.idx < maxes.max_idx THEN
          JSON_SET(obj.objective, '$.nextObjectiveId', JSON_UNQUOTE(JSON_EXTRACT(obj2.objective, '$.id')))
        ELSE
          JSON_REMOVE(obj.objective, '$.nextObjectiveId')
      END AS updated_objective
    FROM Quest q
    JOIN JSON_TABLE(
      q.content,
      '$.objectives[*]' COLUMNS (
        idx FOR ORDINALITY,
        objective JSON PATH '$'
      )
    ) obj
    LEFT JOIN JSON_TABLE(
      q.content,
      '$.objectives[*]' COLUMNS (
        idx2 FOR ORDINALITY,
        objective JSON PATH '$'
      )
    ) obj2 ON obj.idx + 1 = obj2.idx2
    JOIN (
      SELECT q2.id, MAX(obj3.idx) AS max_idx
      FROM Quest q2
      JOIN JSON_TABLE(
        q2.content,
        '$.objectives[*]' COLUMNS (
          idx FOR ORDINALITY
        )
      ) obj3
      GROUP BY q2.id
    ) maxes ON q.id = maxes.id
      AND obj.idx <= maxes.max_idx
  ) obj ON q.id = obj.id
  GROUP BY q.id
) q2 ON q.id = q2.id
SET q.content = JSON_SET(q.content, '$.objectives', CAST(q2.new_objectives AS JSON));