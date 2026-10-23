ALTER TABLE `HuntingSession` ADD `content` json;

-- Existing sessions retain the habitat terms available at migration time.
UPDATE `HuntingSession` AS s
INNER JOIN `HuntingHabitat` AS h ON h.id = s.habitatId
SET s.content = h.content;

-- A running battle already captured its contract before later habitat edits.
UPDATE `HuntingSession` AS s
INNER JOIN `Battle` AS b ON b.id = s.battleId
SET s.content = JSON_SET(s.content, '$.contracts', JSON_ARRAY(JSON_EXTRACT(b.extraState, '$.hunting.contract')))
WHERE JSON_UNQUOTE(JSON_EXTRACT(b.extraState, '$.hunting.contract.id')) = s.contractId;
