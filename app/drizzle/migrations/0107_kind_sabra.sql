ALTER TABLE `HuntingSession` ADD `content` json;

UPDATE `HuntingSession` AS s
INNER JOIN `HuntingHabitat` AS h ON h.id = s.habitatId
SET s.content = h.content;

UPDATE `HuntingSession` AS s
INNER JOIN `Battle` AS b ON b.id = s.battleId
SET s.content = JSON_SET(s.content, '$.contracts', JSON_ARRAY(JSON_EXTRACT(b.extraState, '$.hunting.contract')))
WHERE JSON_UNQUOTE(JSON_EXTRACT(b.extraState, '$.hunting.contract.id')) = s.contractId;
