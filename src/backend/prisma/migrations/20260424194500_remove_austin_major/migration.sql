-- Remove the old BLAST.tv Austin Major circuit until majors are rebuilt.
DELETE FROM "Calendar"
WHERE "payload" IN (
  SELECT CAST("Match"."id" AS TEXT)
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "Calendar"
WHERE "payload" IN (
  SELECT CAST("Competition"."id" AS TEXT)
  FROM "Competition"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "MatchEvent"
WHERE "matchId" IN (
  SELECT "Match"."id"
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "GameToTeam"
WHERE "gameId" IN (
  SELECT "Game"."id"
  FROM "Game"
  INNER JOIN "Match" ON "Match"."id" = "Game"."matchId"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "Game"
WHERE "matchId" IN (
  SELECT "Match"."id"
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "MatchVeto"
WHERE "matchId" IN (
  SELECT "Match"."id"
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "_MatchToPlayer"
WHERE "A" IN (
  SELECT "Match"."id"
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "MatchToTeam"
WHERE "matchId" IN (
  SELECT "Match"."id"
  FROM "Match"
  INNER JOIN "Competition" ON "Competition"."id" = "Match"."competitionId"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "Match"
WHERE "competitionId" IN (
  SELECT "Competition"."id"
  FROM "Competition"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "CompetitionToTeam"
WHERE "competitionId" IN (
  SELECT "Competition"."id"
  FROM "Competition"
  INNER JOIN "Tier" ON "Tier"."id" = "Competition"."tierId"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "Competition"
WHERE "tierId" IN (
  SELECT "Tier"."id"
  FROM "Tier"
  INNER JOIN "League" ON "League"."id" = "Tier"."leagueId"
  WHERE "League"."slug" = 'major'
);

DELETE FROM "Tier"
WHERE "leagueId" IN (
  SELECT "id"
  FROM "League"
  WHERE "slug" = 'major'
);

DELETE FROM "_FederationToLeague"
WHERE "B" IN (
  SELECT "id"
  FROM "League"
  WHERE "slug" = 'major'
);

DELETE FROM "League"
WHERE "slug" = 'major';
