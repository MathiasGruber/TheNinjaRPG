-- Ordinary objective shrines previously left level-zero ownership behind.
DELETE s FROM `Sector` s
LEFT JOIN `Village` v ON v.sector = s.sector
WHERE s.shrineLevel = 0 AND v.id IS NULL
  AND s.sector NOT IN (
    73, 72, 75, 78, 275, 279, 201, 183, 272, 264, 270, 308, 289, 259, 260,
    253, 304, 307, 283, 284, 340, 334, 330, 331, 332, 337, 342, 336, 341,
    335, 113, 109, 443, 227
  );
