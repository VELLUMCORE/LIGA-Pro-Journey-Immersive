ALTER TABLE "Team" ADD COLUMN "competitionFederationId" INTEGER;

CREATE INDEX IF NOT EXISTS "Team_competitionFederationId_idx" ON "Team"("competitionFederationId");
