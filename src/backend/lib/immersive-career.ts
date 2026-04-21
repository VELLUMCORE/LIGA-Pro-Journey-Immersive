import { Calendar } from '@prisma/client';
import { addDays, addMinutes, addYears, isAfter, setHours, setMilliseconds, setMinutes, setSeconds } from 'date-fns';
import DatabaseClient from './database-client';
import * as Worldgen from './worldgen';
import { Constants } from '@liga/shared';

const MATCH_SLOTS = [13, 16, 19, 22];
const PLAY_WINDOW_EARLY_MINUTES = 20;
const PLAY_WINDOW_LATE_MINUTES = 100;

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

export function isWithinPlayableWindow(matchDate: Date, now: Date = new Date()): boolean {
  const opensAt = addMinutes(matchDate, -PLAY_WINDOW_EARLY_MINUTES);
  const closesAt = addMinutes(matchDate, PLAY_WINDOW_LATE_MINUTES);
  return !isAfter(opensAt, now) && !isAfter(now, closesAt);
}

export function hasMissedPlayableWindow(matchDate: Date, now: Date = new Date()): boolean {
  const closesAt = addMinutes(matchDate, PLAY_WINDOW_LATE_MINUTES);
  return isAfter(now, closesAt);
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
          select: { id: true, status: true, date: true },
        });

        if (!match || match.status === Constants.MatchStatus.COMPLETED) {
          await DatabaseClient.prisma.calendar.update({
            where: { id: entry.id },
            data: { completed: true },
          });
          processedAny = true;
          continue;
        }

        if (!hasMissedPlayableWindow(new Date(match.date), now)) {
          continue;
        }

        await DatabaseClient.prisma.calendar.update({
          where: { id: entry.id },
          data: { type: Constants.CalendarEntry.MATCHDAY_NPC },
        });

        await Worldgen.onMatchdayNPC({ ...(entry as Calendar), type: Constants.CalendarEntry.MATCHDAY_NPC });
        await DatabaseClient.prisma.calendar.update({
          where: { id: entry.id },
          data: { completed: true },
        });
        processedAny = true;
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
