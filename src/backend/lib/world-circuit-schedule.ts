import { Constants } from '@liga/shared';

export type WorldCircuitSchedule = {
  startOffsetDays: number;
  endOffsetDays?: number;
};

export const WORLD_CIRCUIT_SCHEDULE: Record<string, WorldCircuitSchedule> = {
  'blast-bounty:spring': { startOffsetDays: 21 },
  'iem:event-1': { startOffsetDays: 27, endOffsetDays: 38 },
  'iem:event-2': { startOffsetDays: 102, endOffsetDays: 108 },
  [Constants.TierSlug.LEAGUE_PRO]: { startOffsetDays: 72 },
  [Constants.TierSlug.LEAGUE_PRO_PLAYOFFS]: { startOffsetDays: 93 },
  'blast-open:spring': { startOffsetDays: 107 },
  'blast-rivals:spring': { startOffsetDays: 124 },
  'pgl-bucharest': { startOffsetDays: 138 },
  'iem:event-3': { startOffsetDays: 130, endOffsetDays: 136 },
  'esports-world-cup': { startOffsetDays: 172 },
  'esl-pro-league:season-23': { startOffsetDays: 192 },
  'starladder-starseries': { startOffsetDays: 209 },
  'blast-bounty:fall': { startOffsetDays: 226 },
  'iem:event-4': { startOffsetDays: 152, endOffsetDays: 171 },
  'blast-open:fall': { startOffsetDays: 260 },
  'blast-rivals:fall': { startOffsetDays: 277 },
  'thunderpick-world-championship': { startOffsetDays: 291 },
  'iem:event-5': { startOffsetDays: 305, endOffsetDays: 311 },
  'cs-asia-championship': { startOffsetDays: 325 },
};

export function getWorldCircuitSchedule(
  tierSlug?: string,
  leagueSlug?: string,
  federationSlug?: string,
) {
  if (
    leagueSlug !== Constants.LeagueSlug.ESPORTS_PRO_LEAGUE ||
    federationSlug !== Constants.FederationSlug.ESPORTS_WORLD ||
    !tierSlug
  ) {
    return null;
  }

  return WORLD_CIRCUIT_SCHEDULE[tierSlug] || null;
}
