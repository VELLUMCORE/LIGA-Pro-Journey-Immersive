-- Ensure the world circuit league and IEM events exist in already-created root saves.
INSERT INTO "League" ("name", "slug", "startOffsetDays")
SELECT 'Counter-Strike World Circuit', 'espl', 21
WHERE NOT EXISTS (
  SELECT 1 FROM "League" WHERE "slug" = 'espl'
);

UPDATE "League"
SET
  "name" = 'Counter-Strike World Circuit',
  "startOffsetDays" = 21
WHERE "slug" = 'espl';

INSERT OR IGNORE INTO "_FederationToLeague" ("A", "B")
SELECT "Federation"."id", "League"."id"
FROM "Federation", "League"
WHERE "Federation"."slug" = 'world'
  AND "League"."slug" = 'espl';

-- Reuse the old two IEM rows when present, so existing tier references stay valid.
UPDATE "Tier"
SET
  "name" = 'IEM Krakow 2026',
  "slug" = 'iem:event-1',
  "size" = 14,
  "groupSize" = NULL,
  "triggerTierSlug" = 'iem:event-2',
  "triggerOffsetDays" = 10,
  "lan" = true,
  "leagueId" = (SELECT "id" FROM "League" WHERE "slug" = 'espl')
WHERE "slug" = 'iem-katowice'
  AND NOT EXISTS (SELECT 1 FROM "Tier" WHERE "slug" = 'iem:event-1');

UPDATE "Tier"
SET
  "name" = 'IEM Rio 2026',
  "slug" = 'iem:event-2',
  "size" = 14,
  "groupSize" = NULL,
  "triggerTierSlug" = 'league:pro',
  "triggerOffsetDays" = 10,
  "lan" = true,
  "leagueId" = (SELECT "id" FROM "League" WHERE "slug" = 'espl')
WHERE "slug" = 'iem-rio'
  AND NOT EXISTS (SELECT 1 FROM "Tier" WHERE "slug" = 'iem:event-2');

INSERT INTO "Tier" (
  "name",
  "slug",
  "size",
  "groupSize",
  "triggerTierSlug",
  "triggerOffsetDays",
  "lan",
  "leagueId"
)
VALUES
  ('IEM Krakow 2026', 'iem:event-1', 14, NULL, 'iem:event-2', 10, true, (SELECT "id" FROM "League" WHERE "slug" = 'espl')),
  ('IEM Rio 2026', 'iem:event-2', 14, NULL, 'league:pro', 10, true, (SELECT "id" FROM "League" WHERE "slug" = 'espl')),
  ('IEM Atlanta 2026', 'iem:event-3', 14, NULL, 'esports-world-cup', 10, true, (SELECT "id" FROM "League" WHERE "slug" = 'espl')),
  ('IEM Cologne 2026', 'iem:event-4', 14, NULL, 'blast-open:fall', 10, true, (SELECT "id" FROM "League" WHERE "slug" = 'espl')),
  ('IEM China 2026', 'iem:event-5', 14, NULL, 'cs-asia-championship', 10, true, (SELECT "id" FROM "League" WHERE "slug" = 'espl'))
ON CONFLICT("slug") DO UPDATE SET
  "name" = excluded."name",
  "size" = excluded."size",
  "groupSize" = excluded."groupSize",
  "triggerTierSlug" = excluded."triggerTierSlug",
  "triggerOffsetDays" = excluded."triggerOffsetDays",
  "lan" = excluded."lan",
  "leagueId" = excluded."leagueId";

UPDATE "Tier"
SET "triggerTierSlug" = 'iem:event-1'
WHERE "slug" = 'blast-bounty:spring';

UPDATE "Tier"
SET "triggerTierSlug" = 'iem:event-3'
WHERE "slug" = 'pgl-bucharest';

UPDATE "Tier"
SET "triggerTierSlug" = 'iem:event-4'
WHERE "slug" = 'blast-bounty:fall';

UPDATE "Tier"
SET "triggerTierSlug" = 'iem:event-5'
WHERE "slug" = 'thunderpick-world-championship';
