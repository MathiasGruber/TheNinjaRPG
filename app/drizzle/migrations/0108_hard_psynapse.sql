UPDATE `HuntingSession` AS s
INNER JOIN `HuntingHabitat` AS h ON h.id = s.habitatId
SET s.content = h.content;
