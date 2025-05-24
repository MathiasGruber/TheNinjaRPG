UPDATE Village SET hexColor = '#FFFFFF' WHERE name = 'Glacier';

DELETE FROM Sector
WHERE sector IN (73, 72, 75, 78, 275, 279, 201, 183, 272, 264, 270, 308, 289, 259, 260, 253, 304, 307, 283, 284);

-- Insert the specified sectors for each village (if they do not already exist)

INSERT INTO Sector (id, sector, villageId, createdAt)
SELECT 
    base.base_id + ROW_NUMBER() OVER (ORDER BY cs.sector)                AS id,
    cs.sector                                                            AS sector,
    v.id                                                                 AS villageId,
    COALESCE(v.createdAt, CURRENT_TIMESTAMP(3))                          AS createdAt
FROM (
    SELECT 'Shine'     AS village_name,  73 AS sector UNION ALL
    SELECT 'Shine',                        72 UNION ALL
    SELECT 'Shine',                        75 UNION ALL
    SELECT 'Shine',                        78 UNION ALL
    SELECT 'Glacier',                     275 UNION ALL
    SELECT 'Glacier',                     279 UNION ALL
    SELECT 'Glacier',                     201 UNION ALL
    SELECT 'Glacier',                     183 UNION ALL
    SELECT 'Current',                     272 UNION ALL
    SELECT 'Current',                     264 UNION ALL
    SELECT 'Current',                     270 UNION ALL
    SELECT 'Current',                     308 UNION ALL
    SELECT 'Shroud',                      289 UNION ALL
    SELECT 'Shroud',                      259 UNION ALL
    SELECT 'Shroud',                      260 UNION ALL
    SELECT 'Shroud',                      253 UNION ALL
    SELECT 'Tsukimori',                   304 UNION ALL
    SELECT 'Tsukimori',                   307 UNION ALL
    SELECT 'Tsukimori',                   283 UNION ALL
    SELECT 'Tsukimori',                   284
) AS cs
JOIN Village v ON v.name = cs.village_name
CROSS JOIN (SELECT COALESCE(MAX(id), 0) AS base_id FROM Sector) base
LEFT JOIN Sector s ON s.sector = cs.sector
WHERE s.id IS NULL;