/**
 * Removes duplicate map pool rows and enforces one map per game version.
 * Also normalizes the CS:GO map pool to the intended active/reserve set.
 */

-- Keep only one row per (gameMapId, gameVersionId) tuple.
DELETE FROM "MapPool"
WHERE id NOT IN (
  SELECT MIN(id)
  FROM "MapPool"
  GROUP BY "gameMapId", "gameVersionId"
);

-- Prevent duplicate rows from being created again.
CREATE UNIQUE INDEX "MapPool_gameMapId_gameVersionId_key"
ON "MapPool"("gameMapId", "gameVersionId");

-- Normalize CS:GO map pool.
DELETE FROM "MapPool"
WHERE "gameVersionId" = (
  SELECT id
  FROM "GameVersion"
  WHERE slug = 'csgo'
);

INSERT INTO "MapPool" (
  "gameMapId",
  "gameVersionId",
  "position"
)
SELECT
  (SELECT id FROM "GameMap" WHERE name = data.name),
  (SELECT id FROM "GameVersion" WHERE slug = 'csgo'),
  data.position
FROM (
  SELECT 'de_mirage' AS name, 0 AS position
  UNION ALL
  SELECT 'de_dust2', 1
  UNION ALL
  SELECT 'de_nuke', 2
  UNION ALL
  SELECT 'de_ancient', 3
  UNION ALL
  SELECT 'de_anubis', 4
  UNION ALL
  SELECT 'de_inferno', 5
  UNION ALL
  SELECT 'de_overpass', 6
  UNION ALL
  SELECT 'de_cache', NULL
  UNION ALL
  SELECT 'de_vertigo', NULL
  UNION ALL
  SELECT 'de_train', NULL
) AS data;
