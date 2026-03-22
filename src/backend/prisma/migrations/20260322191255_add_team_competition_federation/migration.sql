-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "earnings" INTEGER DEFAULT 0,
    "prestige" INTEGER,
    "blazon" TEXT,
    "tier" INTEGER,
    "elo" INTEGER DEFAULT 1000,
    "countryId" INTEGER NOT NULL,
    "competitionFederationId" INTEGER,
    CONSTRAINT "Team_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Team_competitionFederationId_fkey" FOREIGN KEY ("competitionFederationId") REFERENCES "Federation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("blazon", "competitionFederationId", "countryId", "earnings", "elo", "id", "name", "prestige", "slug", "tier") SELECT "blazon", "competitionFederationId", "countryId", "earnings", "elo", "id", "name", "prestige", "slug", "tier" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
CREATE INDEX "Team_elo_id_idx" ON "Team"("elo", "id");
CREATE INDEX "Team_competitionFederationId_idx" ON "Team"("competitionFederationId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
