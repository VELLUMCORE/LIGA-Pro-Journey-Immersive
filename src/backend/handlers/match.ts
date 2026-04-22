/**
 * Match IPC handlers.
 *
 * @module
 */
import Tournament from '@liga/shared/tournament';
import { ipcMain } from 'electron';
import { differenceBy } from 'lodash';
import { startOfDay } from 'date-fns';
import { Constants, Eagers, Util, is } from '@liga/shared';
import { DatabaseClient } from '@liga/backend/lib';
import { Prisma } from '@prisma/client';

type MatchVetoInput = {
  type?: string;
  map?: string;
  teamId?: number | null;
};

async function ensureMatchVetoTable() {
  await DatabaseClient.prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "MatchVeto" (
      "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
      "type" TEXT NOT NULL,
      "map" TEXT NOT NULL,
      "matchId" INTEGER NOT NULL,
      "teamId" INTEGER,
      CONSTRAINT "MatchVeto_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT "MatchVeto_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
}

async function ensureDeveloperDebugEnabled() {
  if (!is.dev()) {
    throw new Error('DEBUG_DEV_ONLY');
  }

  const profile = await DatabaseClient.prisma.profile.findFirst();
  const settings = Util.loadSettings(profile?.settings);
  if (!(settings.general as any).debug) {
    throw new Error('DEBUG_MODE_DISABLED');
  }
}

/**
 * Register the IPC event handlers.
 *
 * @function
 */
export default function () {
  ipcMain.handle(Constants.IPCRoute.MATCH_FIND, (_, query: Prisma.MatchFindFirstArgs) =>
    DatabaseClient.prisma.match.findFirst(query),
  );
  ipcMain.handle(Constants.IPCRoute.MATCH_FIND_VETO_LIST, async (_, id: number) => {
    await ensureMatchVetoTable();

    return DatabaseClient.prisma.$queryRaw<
      Array<{ id: number; type: string; map: string; teamId: number | null }>
    >`SELECT "id", "type", "map", "teamId" FROM "MatchVeto" WHERE "matchId" = ${id} ORDER BY "id" ASC`;
  });
  ipcMain.handle(
    Constants.IPCRoute.MATCH_UPDATE_MAP_LIST,
    async (_, id: number, maps: Array<string>) => {
      const match = await DatabaseClient.prisma.match.findFirst({
        ...Eagers.match,
        where: { id },
      });

      // update the tourney object metadata with the map list
      const tournament = Tournament.restore(JSON.parse(match.competition.tournament));
      tournament.$base.findMatch(JSON.parse(match.payload)).data['maps'] = maps;

      // update the match database record with the map list
      return DatabaseClient.prisma.match.update({
        where: { id },
        data: {
          competition: {
            update: {
              tournament: JSON.stringify(tournament.save()),
            },
          },
          games: {
            update: match.games.map((game, gameIdx) => ({
              where: { id: game.id },
              data: {
                map: maps[gameIdx] || game.map,
                // ensure competitors have been added
                // to the current game in the series
                //
                // @todo: remove after beta
                teams: {
                  create: differenceBy(match.competitors, game.teams, 'teamId').map(
                    (competitor) => ({
                      teamId: competitor.teamId,
                      seed: competitor.seed,
                    }),
                  ),
                },
              },
            })),
          },
        },
      });
    },
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCH_UPDATE_VETO_LIST,
    async (_, id: number, data: Array<MatchVetoInput>) => {
      const vetoes = data.filter((item) => !!item.type && !!item.map);
      await ensureMatchVetoTable();

      await DatabaseClient.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`DELETE FROM "MatchVeto" WHERE "matchId" = ${id}`;

        for (const item of vetoes) {
          await tx.$executeRaw`
            INSERT INTO "MatchVeto" ("type", "map", "matchId", "teamId")
            VALUES (${item.type}, ${item.map}, ${id}, ${item.teamId ?? null})
          `;
        }
      });

      return true;
    },
  );
  ipcMain.handle('/debug/match-reschedule', async (_, payload: { matchId: number; time: string }) => {
    await ensureDeveloperDebugEnabled();

    const matchId = Number(payload?.matchId);
    const time = String(payload?.time || '');
    if (!Number.isFinite(matchId) || matchId <= 0 || !/^\d{2}:\d{2}$/.test(time)) {
      throw new Error('INVALID_DEBUG_RESCHEDULE_PAYLOAD');
    }

    const match = await DatabaseClient.prisma.match.findFirst({ where: { id: matchId } });
    if (!match || match.status === Constants.MatchStatus.COMPLETED) {
      throw new Error('MATCH_NOT_FOUND');
    }

    const [hours, minutes] = time.split(':').map((value) => Number(value));
    const nextDate = new Date(match.date);
    nextDate.setHours(hours, minutes, 0, 0);

    const updated = await DatabaseClient.prisma.match.update({
      where: { id: match.id },
      data: { date: nextDate },
      include: Eagers.match.include,
    });

    await DatabaseClient.prisma.calendar.updateMany({
      where: {
        payload: String(match.id),
        type: {
          in: [Constants.CalendarEntry.MATCHDAY_USER, Constants.CalendarEntry.MATCHDAY_NPC],
        },
      },
      data: {
        date: nextDate,
      },
    });

    return updated;
  });
  ipcMain.handle(Constants.IPCRoute.MATCHES_ALL, (_, query: Prisma.MatchFindManyArgs) =>
    DatabaseClient.prisma.match.findMany(query),
  );
  ipcMain.handle(Constants.IPCRoute.MATCHES_COUNT, (_, where?: Prisma.MatchWhereInput) =>
    DatabaseClient.prisma.match.count({ where }),
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_PREVIOUS,
    async (_, query: Partial<Prisma.MatchFindManyArgs> = {}, id: number, limit = 5) => {
      const profile = await DatabaseClient.prisma.profile.findFirst();
      return DatabaseClient.prisma.match.findMany({
        ...query,
        take: limit,
        where: {
          AND: [
            query.where ?? {},
            {
              competitionId: { not: null }, // <- prevents match.competition === null
              date: { lte: profile.date.toISOString() },
              competitors: { some: { teamId: id } },
              status: Constants.MatchStatus.COMPLETED,
            },
          ],
        },
        orderBy: { date: "desc" },
      });
    },
  );
  ipcMain.handle(
    Constants.IPCRoute.MATCHES_UPCOMING,
    async (_, query: Partial<Prisma.MatchFindManyArgs> = {}, limit = 5) => {
      const profile = await DatabaseClient.prisma.profile.findFirst();
      // Teamless safety: no upcoming team matches.
      if (!profile?.teamId) {
        return [];
      }
      return DatabaseClient.prisma.match.findMany({
        ...query,
        take: limit,
        where: {
          AND: [
            query.where ?? {},
            {
              competitionId: { not: null },
              date: { gte: startOfDay(profile.date).toISOString() },
              competitors: { some: { teamId: profile.teamId } },
              status: { not: Constants.MatchStatus.COMPLETED },
            },
          ],
        },
        orderBy: { date: "asc" },
      });
    },
  );
}
