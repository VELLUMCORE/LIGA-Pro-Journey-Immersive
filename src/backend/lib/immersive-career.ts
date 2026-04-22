import { Calendar } from '@prisma/client';
import { addDays, addMinutes, addYears, differenceInMinutes, isAfter, setHours, setMilliseconds, setMinutes, setSeconds } from 'date-fns';
import DatabaseClient from './database-client';
import * as Worldgen from './worldgen';
import * as Simulator from './simulator';
import * as XpEconomy from './xp-economy';
import { Constants, Util } from '@liga/shared';

const MATCH_SLOTS = [13, 16, 19, 22];
const PLAY_WINDOW_EARLY_MINUTES = 20;
const MAP_SEGMENT_MINUTES = 60;
const LATE_SPECTATE_GRACE_MINUTES = 5;

type RealtimeMatchPayload = Awaited<ReturnType<typeof loadRealtimeMatch>>;

type RealtimeMatchSyncResult = {
  didMutate: boolean;
  forceSpectate: boolean;
  match: RealtimeMatchPayload | null;
  resultOnly: boolean;
};

export function getSeasonAnchorDate(referenceDate: Date = new Date()): Date {
  const anchor = new Date(referenceDate);
  anchor.setMonth(0, 1);
  anchor.setHours(10, 0, 0, 0);
  return anchor;
}

export function getNextSeasonAnchorDate(referenceDate: Date = new Date()): Date {
  return addYears(getSeasonAnchorDate(referenceDate), 1);
}

export function withCompetitionStartTime(date: Date): Date {
  const next = new Date(date);
  next.setHours(10, 0, 0, 0);
  return next;
}

export function withMatchKickoff(date: Date, matchOrdinal = 0): Date {
  const next = new Date(date);
  const slotHour = MATCH_SLOTS[Math.abs(matchOrdinal) % MATCH_SLOTS.length] ?? 19;
  return setMilliseconds(setSeconds(setMinutes(setHours(next, slotHour), 0), 0), 0);
}

function getRealtimeWindowMinutes(totalGames = 1): number {
  return MAP_SEGMENT_MINUTES * Math.max(1, totalGames);
}

export function getElapsedRealtimeMatchMinutes(matchDate: Date, now: Date = new Date()): number {
  return differenceInMinutes(now, matchDate);
}

export function shouldForceRealtimeSpectating(matchDate: Date, now: Date = new Date()): boolean {
  return getElapsedRealtimeMatchMinutes(matchDate, now) >= LATE_SPECTATE_GRACE_MINUTES;
}

export function isWithinPlayableWindow(matchDate: Date, now: Date = new Date(), totalGames = 1): boolean {
  const opensAt = addMinutes(matchDate, -PLAY_WINDOW_EARLY_MINUTES);
  const closesAt = addMinutes(matchDate, getRealtimeWindowMinutes(totalGames));
  return !isAfter(opensAt, now) && !isAfter(now, closesAt);
}

export function hasMissedPlayableWindow(matchDate: Date, now: Date = new Date(), totalGames = 1): boolean {
  const closesAt = addMinutes(matchDate, getRealtimeWindowMinutes(totalGames));
  return isAfter(now, closesAt);
}

async function loadRealtimeMatch(matchId: number) {
  return DatabaseClient.prisma.match.findFirst({
    where: { id: matchId },
    include: {
      competitors: {
        include: {
          team: {
            include: {
              players: true,
            },
          },
        },
      },
      competition: {
        include: {
          tier: true,
        },
      },
      games: {
        include: {
          teams: true,
        },
      },
    },
  });
}

function ensureDecisiveMapScore(
  simulationResult: Record<number, number>,
  homeTeamId: number,
  awayTeamId: number,
  homeTeamElo?: number | null,
  awayTeamElo?: number | null,
) {
  if (simulationResult[homeTeamId] !== simulationResult[awayTeamId]) {
    return simulationResult;
  }

  const homeWinsTiebreak = Number(homeTeamElo ?? 1000) >= Number(awayTeamElo ?? 1000);
  return {
    ...simulationResult,
    [homeTeamId]: simulationResult[homeTeamId] + Number(homeWinsTiebreak),
    [awayTeamId]: simulationResult[awayTeamId] + Number(!homeWinsTiebreak),
  };
}

async function finalizeCompletedRealtimeMatch(
  match: NonNullable<RealtimeMatchPayload>,
  profile?: { playerId: number | null; teamId: number | null },
) {
  const [home, away] = match.competitors;
  if (!home?.team || !away?.team) {
    return;
  }

  const homeTeamId = home.teamId ?? home.team.id;
  const awayTeamId = away.teamId ?? away.team.id;
  const finalScore = {
    [homeTeamId]: Number(home.score ?? 0),
    [awayTeamId]: Number(away.score ?? 0),
  };

  const homeExpectedScore = Util.getEloWinProbability(
    Number(home.team.elo ?? 1000),
    Number(away.team.elo ?? 1000),
  );
  const homeActualScore = Constants.EloScore[Simulator.getMatchResult(homeTeamId, finalScore)];
  const awayExpectedScore = 1 - homeExpectedScore;
  const awayActualScore = Constants.EloScore[Simulator.getMatchResult(awayTeamId, finalScore)];
  const deltas = [
    Util.getEloRatingDelta(homeActualScore, homeExpectedScore),
    Util.getEloRatingDelta(awayActualScore, awayExpectedScore),
  ];

  await Promise.all(
    deltas.map((delta, teamIdx) =>
      DatabaseClient.prisma.team.update({
        where: {
          id: match.competitors[teamIdx].team.id,
        },
        data: {
          elo: Util.clampElo(Number(match.competitors[teamIdx].team.elo ?? 1000) + delta),
        },
      }),
    ),
  );

  await XpEconomy.applyMatchXpFromCompletedMatch({
    matchId: match.id,
    profile,
  });
  await Worldgen.recordMatchResults();
}

async function simulateMissedRealtimeGame(
  match: NonNullable<RealtimeMatchPayload>,
  profile?: { playerId: number | null; teamId: number | null },
) {
  const [home, away] = match.competitors;
  const currentGame = match.games.find((game) => game.status !== Constants.MatchStatus.COMPLETED);

  if (!home?.team || !away?.team || !currentGame) {
    return match;
  }

  const homeTeamId = home.teamId ?? home.team.id;
  const awayTeamId = away.teamId ?? away.team.id;
  const simulator = new Simulator.Score();
  simulator.allowDraw = match.games.length === 1 && Boolean(match.competition?.tier?.groupSize);

  let simulationResult = simulator.generate([home.team, away.team]);

  if (!simulator.allowDraw) {
    simulationResult = ensureDecisiveMapScore(
      simulationResult,
      homeTeamId,
      awayTeamId,
      home.team.elo,
      away.team.elo,
    );
  }

  const gameScore = {
    [homeTeamId]: Number(simulationResult[homeTeamId] ?? 0),
    [awayTeamId]: Number(simulationResult[awayTeamId] ?? 0),
  };
  const seriesScore = match.games.length > 1
    ? {
      [homeTeamId]: Number(home.score ?? 0) + Number(Simulator.getMatchResult(homeTeamId, gameScore) === Constants.MatchResult.WIN),
      [awayTeamId]: Number(away.score ?? 0) + Number(Simulator.getMatchResult(awayTeamId, gameScore) === Constants.MatchResult.WIN),
    }
    : gameScore;
  const winsToClinch = Math.floor(Math.max(1, match.games.length) / 2) + 1;
  const matchCompleted = match.games.length === 1
    || Object.values(seriesScore).some((score) => score >= winsToClinch);

  await DatabaseClient.prisma.match.update({
    where: { id: match.id },
    data: {
      status: matchCompleted ? Constants.MatchStatus.COMPLETED : Constants.MatchStatus.PLAYING,
      competitors: {
        update: [
          {
            where: { id: home.id },
            data: {
              score: seriesScore[homeTeamId],
              result: matchCompleted ? Simulator.getMatchResult(homeTeamId, seriesScore) : home.result,
            },
          },
          {
            where: { id: away.id },
            data: {
              score: seriesScore[awayTeamId],
              result: matchCompleted ? Simulator.getMatchResult(awayTeamId, seriesScore) : away.result,
            },
          },
        ],
      },
      games: {
        update: {
          where: { id: currentGame.id },
          data: {
            status: Constants.MatchStatus.COMPLETED,
            teams: {
              update: currentGame.teams.map((entry) => {
                const teamId = Number(entry.teamId ?? 0);
                return {
                  where: { id: entry.id },
                  data: {
                    score: gameScore[teamId] ?? 0,
                    result: Simulator.getMatchResult(teamId, gameScore),
                  },
                };
              }),
            },
          },
        },
      },
    },
  });

  const updatedMatch = await loadRealtimeMatch(match.id);
  if (updatedMatch?.status === Constants.MatchStatus.COMPLETED) {
    await finalizeCompletedRealtimeMatch(updatedMatch, profile);
  }

  return updatedMatch;
}

export async function syncUserMatchProgress(
  matchId: number,
  now: Date = new Date(),
  profile?: { playerId: number | null; teamId: number | null },
): Promise<RealtimeMatchSyncResult> {
  let match = await loadRealtimeMatch(matchId);
  if (!match) {
    return {
      didMutate: false,
      forceSpectate: false,
      match: null,
      resultOnly: false,
    };
  }

  const totalGames = Math.max(1, match.games.length || 1);
  const resultOnly = hasMissedPlayableWindow(new Date(match.date), now, totalGames);
  const forceSpectate = shouldForceRealtimeSpectating(new Date(match.date), now);

  if (match.status === Constants.MatchStatus.COMPLETED) {
    return {
      didMutate: false,
      forceSpectate,
      match,
      resultOnly,
    };
  }

  let didMutate = false;
  const elapsedMinutes = getElapsedRealtimeMatchMinutes(new Date(match.date), now);
  const targetCompletedGames = resultOnly
    ? totalGames
    : Math.min(totalGames, Math.max(0, Math.floor(elapsedMinutes / MAP_SEGMENT_MINUTES)));

  while (
    match
    && match.status !== Constants.MatchStatus.COMPLETED
    && match.games.filter((game) => game.status === Constants.MatchStatus.COMPLETED).length < targetCompletedGames
  ) {
    const updatedMatch = await simulateMissedRealtimeGame(match, profile);
    if (!updatedMatch) {
      break;
    }

    match = updatedMatch;
    didMutate = true;
  }

  if (match && match.status !== Constants.MatchStatus.COMPLETED && elapsedMinutes >= 0) {
    const pendingGames = match.games.filter((game) => game.status !== Constants.MatchStatus.COMPLETED);
    const needsLiveStatusSync = match.status !== Constants.MatchStatus.PLAYING
      || pendingGames.some((game, idx) => game.status !== (idx === 0 ? Constants.MatchStatus.PLAYING : Constants.MatchStatus.READY));

    if (needsLiveStatusSync) {
      await DatabaseClient.prisma.match.update({
        where: { id: match.id },
        data: {
          status: Constants.MatchStatus.PLAYING,
          games: {
            update: pendingGames.map((game, idx) => ({
              where: { id: game.id },
              data: {
                status: idx === 0 ? Constants.MatchStatus.PLAYING : Constants.MatchStatus.READY,
              },
            })),
          },
        },
      });
      match = await loadRealtimeMatch(match.id);
      didMutate = true;
    }
  }

  return {
    didMutate,
    forceSpectate,
    match,
    resultOnly,
  };
}

function getCalendarEntryHandler(type: string) {
  switch (type) {
    case Constants.CalendarEntry.COMPETITION_START:
      return Worldgen.onCompetitionStart;
    case Constants.CalendarEntry.EMAIL_SEND:
      return Worldgen.onEmailSend;
    case Constants.CalendarEntry.MATCHDAY_NPC:
      return Worldgen.onMatchdayNPC;
    case Constants.CalendarEntry.SEASON_START:
      return Worldgen.onSeasonStart;
    case Constants.CalendarEntry.PLAYER_CONTRACT_EXPIRE:
      return Worldgen.onPlayerContractExpire;
    case Constants.CalendarEntry.PLAYER_SCOUTING_CHECK:
      return Worldgen.onPlayerScoutingCheck;
    case Constants.CalendarEntry.PLAYER_CONTRACT_REVIEW:
      return Worldgen.onPlayerContractReview;
    case Constants.CalendarEntry.PLAYER_CONTRACT_EXTENSION_EVAL:
      return Worldgen.onPlayerContractExtensionEval;
    case Constants.CalendarEntry.TRANSFER_OFFER_EXPIRY_CHECK:
      return Worldgen.onTransferOfferExpiryCheck;
    case Constants.CalendarEntry.TRANSFER_PARSE:
      return Worldgen.onTransferParse;
    default:
      return null;
  }
}

export async function syncRealtimeWorld(): Promise<any | null> {
  const profile = await DatabaseClient.prisma.profile.findFirst({ include: { player: true, team: true } });
  if (!profile) {
    return null;
  }

  const now = new Date();

  while (true) {
    const dueEntries = await DatabaseClient.prisma.calendar.findMany({
      where: {
        completed: false,
        date: {
          lte: now.toISOString(),
        },
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      take: 250,
    });

    if (!dueEntries.length) {
      break;
    }

    let processedAny = false;

    for (const entry of dueEntries) {
      if (entry.type === Constants.CalendarEntry.MATCHDAY_USER) {
        const match = await DatabaseClient.prisma.match.findFirst({
          where: { id: Number(entry.payload) },
          include: {
            games: {
              select: { id: true },
            },
          },
        });

        if (!match || match.status === Constants.MatchStatus.COMPLETED) {
          await DatabaseClient.prisma.calendar.update({
            where: { id: entry.id },
            data: { completed: true },
          });
          processedAny = true;
          continue;
        }

        const syncedMatch = await syncUserMatchProgress(match.id, now, {
          teamId: profile.teamId,
          playerId: profile.playerId,
        });

        if (syncedMatch.didMutate) {
          processedAny = true;
        }

        if (syncedMatch.match?.status === Constants.MatchStatus.COMPLETED) {
          await DatabaseClient.prisma.calendar.update({
            where: { id: entry.id },
            data: { completed: true },
          });
          processedAny = true;
        }

        continue;
      }

      const handler = getCalendarEntryHandler(entry.type);
      if (!handler) {
        continue;
      }

      await handler(entry as Calendar);
      await DatabaseClient.prisma.calendar.update({
        where: { id: entry.id },
        data: { completed: true },
      });
      processedAny = true;
    }

    if (!processedAny) {
      break;
    }
  }

  return DatabaseClient.prisma.profile.update({
    where: { id: profile.id },
    data: {
      date: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    include: { player: true, team: true },
  });
}

export function getCompetitionPresentation(competition: {
  federation?: { slug?: string | null; name?: string | null } | null;
  tier?: { lan?: boolean | null; name?: string | null; slug?: string | null } | null;
}) {
  const isLan = Boolean(competition?.tier?.lan);
  const federationName = competition?.federation?.name || 'Global';

  if (!isLan) {
    return {
      mode: 'Online',
      venue: `${federationName} online servers`,
    };
  }

  return {
    mode: 'Offline (LAN)',
    venue: `${federationName} LAN studio / arena`,
  };
}
