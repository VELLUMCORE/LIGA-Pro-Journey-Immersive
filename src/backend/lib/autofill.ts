/**
 * Dynamically populates any given competition's series
 * with teams depending on the criteria provided
 * in the autofill protocol schema.
 *
 * @module
 */
import log from 'electron-log';
import DatabaseClient from './database-client';
import { differenceBy, flatten } from 'lodash';
import { Prisma, Team } from '@prisma/client';
import { Constants, Eagers, Util } from '@liga/shared';

const InvitationalTierSlug = {
  BLAST_BOUNTY_SPRING: 'blast-bounty:spring',
  IEM_KATOWICE: 'iem-katowice',
  BLAST_OPEN_SPRING: 'blast-open:spring',
  BLAST_RIVALS_SPRING: 'blast-rivals:spring',
  PGL_BUCHAREST: 'pgl-bucharest',
  ESPORTS_WORLD_CUP: 'esports-world-cup',
  ESL_PRO_LEAGUE_SEASON_23: 'esl-pro-league:season-23',
  STARLADDER_STARSERIES: 'starladder-starseries',
  BLAST_BOUNTY_FALL: 'blast-bounty:fall',
  IEM_RIO: 'iem-rio',
  BLAST_OPEN_FALL: 'blast-open:fall',
  BLAST_RIVALS_FALL: 'blast-rivals:fall',
  THUNDERPICK_WORLD_CHAMPIONSHIP: 'thunderpick-world-championship',
  CS_ASIA_CHAMPIONSHIP: 'cs-asia-championship',
} as const;

const REGIONAL_LEAGUE_TIERS = new Set<string>([
  Constants.TierSlug.LEAGUE_OPEN,
  Constants.TierSlug.LEAGUE_INTERMEDIATE,
  Constants.TierSlug.LEAGUE_MAIN,
  Constants.TierSlug.LEAGUE_ADVANCED,
]);

const REGIONAL_PLAYOFF_TIER_BY_TIER: Partial<Record<string, string>> = {
  [Constants.TierSlug.LEAGUE_OPEN]: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_INTERMEDIATE]: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_MAIN]: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
  [Constants.TierSlug.LEAGUE_ADVANCED]: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
};

const CUSTOM_INVITATIONAL_TIERS = new Set<string>(Object.values(InvitationalTierSlug));
const WORLD_FEDERATION_ORDER = [
  Constants.FederationSlug.ESPORTS_EUROPA,
  Constants.FederationSlug.ESPORTS_AMERICAS,
  Constants.FederationSlug.ESPORTS_ASIA,
  Constants.FederationSlug.ESPORTS_OCE,
] as const;

type RegionQuota = Partial<Record<Constants.FederationSlug, [number, number]>>;
type CompetitionWithTeamCompetitors = Prisma.CompetitionGetPayload<{
  include: { competitors: { include: { team: true } } };
}>;

const WORLD_EVENT_16: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 8],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 4],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 2],
};

const WORLD_EVENT_12: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 6],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 3],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 1],
};

const WORLD_EVENT_8: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 4],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 2],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 1],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 1],
};

const WORLD_EVENT_4: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 1],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 1],
};

const PREVIOUS_SEASON_ADVANCED_QUALIFIERS: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 4],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 4],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 2],
};

const EPL_SEASON_22_FALLBACK: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 10],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 6],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 2],
};

const CURRENT_SEASON_ADVANCED_QUALIFIERS: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 2],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 2],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 1],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 1],
};

const EPL_SEASON_23_FALLBACK: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_EUROPA]: [1, 3],
  [Constants.FederationSlug.ESPORTS_AMERICAS]: [1, 2],
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 1],
};

const ASIA_EVENT_8: RegionQuota = {
  [Constants.FederationSlug.ESPORTS_ASIA]: [1, 6],
  [Constants.FederationSlug.ESPORTS_OCE]: [1, 2],
};

export enum Action {
  EXCLUDE = 'exclude',
  FALLBACK = 'fallback',
  INCLUDE = 'include',
}

export interface Entry {
  action: Action;
  from: string;
  target: string;
  start: Constants.Zones | number;
  end?: Constants.Zones | number;
  season?: number;
  federationSlug?: Constants.FederationSlug;
  includeCountryCodes?: Array<string>;
  excludeCountryCodes?: Array<string>;
}

export interface Item {
  tierSlug: string;
  on: Constants.CalendarEntry;
  entries: Array<Entry>;
}

const federationEntry = (
  action: Action,
  from: string,
  target: string,
  federationSlug: Constants.FederationSlug,
  start: number,
  end?: number,
  season?: number,
): Entry => ({
  action,
  from,
  target,
  federationSlug,
  start,
  ...(typeof end === 'number' ? { end } : {}),
  ...(typeof season === 'number' ? { season } : {}),
});

const regionalEntry = (
  action: Action,
  target: string,
  federationSlug: Constants.FederationSlug,
  start: number,
  end?: number,
  season?: number,
  from = Constants.LeagueSlug.ESPORTS_LEAGUE,
): Entry => federationEntry(action, from, target, federationSlug, start, end, season);

const worldOverallEntry = (
  action: Action,
  target: string,
  start: number,
  end?: number,
  season?: number,
  from = Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
): Entry => federationEntry(
  action,
  from,
  target,
  Constants.FederationSlug.ESPORTS_WORLD,
  start,
  end,
  season,
);

const quotaEntries = (
  action: Action,
  from: string,
  target: string,
  quotas: RegionQuota,
  season?: number,
): Array<Entry> =>
  WORLD_FEDERATION_ORDER.flatMap((federationSlug) => {
    const quota = quotas[federationSlug];
    return quota
      ? [federationEntry(action, from, target, federationSlug, quota[0], quota[1], season)]
      : [];
  });

const worldCircuitFallbackEntries = (target: string, quotas: RegionQuota): Array<Entry> =>
  quotaEntries(Action.FALLBACK, Constants.LeagueSlug.ESPORTS_PRO_LEAGUE, target, quotas);

const worldCircuitIncludeEntries = (
  sourceTierSlug: string,
  quotas: RegionQuota,
  season = 0,
): Array<Entry> =>
  quotaEntries(Action.INCLUDE, Constants.LeagueSlug.ESPORTS_PRO_LEAGUE, sourceTierSlug, quotas, season);

const regionalLeagueIncludeEntries = (
  sourceTierSlug: string,
  quotas: RegionQuota,
  season: number,
): Array<Entry> =>
  quotaEntries(Action.INCLUDE, Constants.LeagueSlug.ESPORTS_LEAGUE, sourceTierSlug, quotas, season);

export const Items: Array<Item> = [
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_EUROPA, 17, 40, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 5, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_EUROPA, 27, 30, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_AMERICAS, 17, 40, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 5, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_AMERICAS, 27, 30, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_ASIA, 9, 30, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_ASIA, 3, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_ASIA, 19, 20, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_OCE, 9, 20, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_OCE, 3, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_OCE, 15, 16, -1),
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_OPEN,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_EUROPA, 1, 16, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 16, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_ASIA, 1, 8, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN, Constants.FederationSlug.ESPORTS_OCE, 1, 8, 0),
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_EUROPA, 9, 26, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 5, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_EUROPA, 17, 20, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_AMERICAS, 9, 26, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 5, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_AMERICAS, 17, 20, -1),
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 8, 0),
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_EUROPA, 9, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 5, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_EUROPA, 17, 20, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_AMERICAS, 9, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 5, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_AMERICAS, 17, 20, -1),
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_MAIN,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 8, 0),
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_EUROPA, 9, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, Constants.FederationSlug.ESPORTS_EUROPA, 5, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 4, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_AMERICAS, 9, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, Constants.FederationSlug.ESPORTS_AMERICAS, 5, 16, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_ASIA, 1, 2, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_ASIA, 9, 18, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, Constants.FederationSlug.ESPORTS_ASIA, 4, 8, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS, Constants.FederationSlug.ESPORTS_OCE, 1, 2, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_OCE, 9, 13, -1),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, Constants.FederationSlug.ESPORTS_OCE, 2, 8, -1),
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_LEAGUE,
        target: Constants.TierSlug.LEAGUE_ADVANCED,
        start: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_EUROPA, 1, 16, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 16, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_ASIA, 1, 8, 0),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_ADVANCED, Constants.FederationSlug.ESPORTS_OCE, 1, 8, 0),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_BOUNTY_SPRING,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_BOUNTY_SPRING, WORLD_EVENT_16),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.IEM_KATOWICE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.IEM_KATOWICE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_BOUNTY_SPRING, 1, 8, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.IEM_KATOWICE, WORLD_EVENT_8),
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      ...regionalLeagueIncludeEntries(Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, PREVIOUS_SEASON_ADVANCED_QUALIFIERS, -1),
      ...worldCircuitFallbackEntries(Constants.TierSlug.LEAGUE_PRO, EPL_SEASON_22_FALLBACK),
    ],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_PRO, 1, 16, 0),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_OPEN_SPRING,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_OPEN_SPRING,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, Constants.TierSlug.LEAGUE_PRO_PLAYOFFS, 1, 8, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_OPEN_SPRING, WORLD_EVENT_8),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_RIVALS_SPRING,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_RIVALS_SPRING,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_OPEN_SPRING, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_RIVALS_SPRING, WORLD_EVENT_4),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.PGL_BUCHAREST,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.PGL_BUCHAREST,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_RIVALS_SPRING, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.PGL_BUCHAREST, WORLD_EVENT_4),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.ESPORTS_WORLD_CUP,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.ESPORTS_WORLD_CUP,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.PGL_BUCHAREST, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.ESPORTS_WORLD_CUP, WORLD_EVENT_12),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.ESPORTS_WORLD_CUP, 1, 4, 0),
      ...regionalLeagueIncludeEntries(Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS, CURRENT_SEASON_ADVANCED_QUALIFIERS, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23, EPL_SEASON_23_FALLBACK),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.STARLADDER_STARSERIES,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.STARLADDER_STARSERIES,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.STARLADDER_STARSERIES, WORLD_EVENT_4),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_BOUNTY_FALL,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_BOUNTY_FALL,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.STARLADDER_STARSERIES, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_BOUNTY_FALL, WORLD_EVENT_12),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.IEM_RIO,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.IEM_RIO,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_BOUNTY_FALL, 1, 8, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.IEM_RIO, WORLD_EVENT_8),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_OPEN_FALL,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_OPEN_FALL,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.IEM_RIO, 1, 8, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_OPEN_FALL, WORLD_EVENT_8),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_RIVALS_FALL,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.BLAST_RIVALS_FALL,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_OPEN_FALL, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.BLAST_RIVALS_FALL, WORLD_EVENT_4),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.THUNDERPICK_WORLD_CHAMPIONSHIP,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: InvitationalTierSlug.THUNDERPICK_WORLD_CHAMPIONSHIP,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      worldOverallEntry(Action.INCLUDE, InvitationalTierSlug.BLAST_RIVALS_FALL, 1, 4, 0),
      ...worldCircuitFallbackEntries(InvitationalTierSlug.THUNDERPICK_WORLD_CHAMPIONSHIP, WORLD_EVENT_4),
    ],
  },
  {
    tierSlug: InvitationalTierSlug.CS_ASIA_CHAMPIONSHIP,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      ...worldCircuitFallbackEntries(InvitationalTierSlug.CS_ASIA_CHAMPIONSHIP, ASIA_EVENT_8),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_ASIA, 1, 62, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_ASIA, 1, 60, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        includeCountryCodes: ['CN'],
        start: 1,
        end: 32,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [
      {
        action: Action.FALLBACK,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        includeCountryCodes: ['CN'],
        start: 1,
        end: 30,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 102, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 98, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_EUROPA, 1, 94, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_EUROPA, 1, 90, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3, Constants.FederationSlug.ESPORTS_EUROPA, 1, 86, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4, Constants.FederationSlug.ESPORTS_EUROPA, 1, 82, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4, Constants.FederationSlug.ESPORTS_EUROPA, 1, 8, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_OCE, 1, 36, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [regionalEntry(Action.FALLBACK, Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_OCE, 1, 35, undefined, Constants.LeagueSlug.ESPORTS_MAJOR)],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_ASIA, 1, 2, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_ASIA, 1, 2, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        includeCountryCodes: ['CN'],
        start: 1,
        end: 2,
        season: 0,
      },
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        federationSlug: Constants.FederationSlug.ESPORTS_ASIA,
        includeCountryCodes: ['CN'],
        start: 1,
        end: 2,
        season: 0,
      },
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1, Constants.FederationSlug.ESPORTS_OCE, 1, 1, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2, Constants.FederationSlug.ESPORTS_OCE, 1, 1, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_RMR_A, Constants.FederationSlug.ESPORTS_EUROPA, 1, 5, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_EUROPE_RMR_B, Constants.FederationSlug.ESPORTS_EUROPA, 1, 5, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_AMERICAS_RMR, Constants.FederationSlug.ESPORTS_AMERICAS, 1, 3, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
      regionalEntry(Action.INCLUDE, Constants.TierSlug.MAJOR_ASIA_RMR, Constants.FederationSlug.ESPORTS_ASIA, 1, 3, 0, Constants.LeagueSlug.ESPORTS_MAJOR),
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 8,
        season: 0,
      },
    ],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    on: Constants.CalendarEntry.SEASON_START,
    entries: [],
  },
  {
    tierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    on: Constants.CalendarEntry.COMPETITION_START,
    entries: [
      {
        action: Action.INCLUDE,
        from: Constants.LeagueSlug.ESPORTS_MAJOR,
        target: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        federationSlug: Constants.FederationSlug.ESPORTS_WORLD,
        start: 1,
        end: 8,
        season: 0,
      },
    ],
  },
];

function sliceRanked<T>(items: Array<T>, start: number, end?: number) {
  return items.slice(start < 0 ? start : Math.max(0, start - 1), end || undefined);
}

function buildCountryFilter(entry: Entry): Prisma.CountryWhereInput | null {
  const excludeCountryCodes = entry.excludeCountryCodes?.length
    ? new Set(entry.excludeCountryCodes)
    : null;
  const includeCountryCodes = entry.includeCountryCodes?.length
    ? new Set(entry.includeCountryCodes)
    : null;

  if (!includeCountryCodes && !excludeCountryCodes) {
    return null;
  }

  return {
    code: {
      ...(includeCountryCodes ? { in: [...includeCountryCodes] } : {}),
      ...(excludeCountryCodes ? { notIn: [...excludeCountryCodes] } : {}),
    },
  };
}

function buildCompetitionFederationWhere(
  federationSlug: Constants.FederationSlug,
  countryFilter?: Prisma.CountryWhereInput | null,
): Prisma.TeamWhereInput {
  const countryWhere: Prisma.CountryWhereInput = {
    ...(countryFilter || {}),
    ...(federationSlug !== Constants.FederationSlug.ESPORTS_WORLD
      ? {
          continent: {
            federation: {
              slug: federationSlug,
            },
          },
        }
      : {}),
  };

  return Object.keys(countryWhere).length ? { country: countryWhere } : {};
}

async function getRegionalLeaguePlacements(
  tierSlug: string,
  federationSlug: Constants.FederationSlug,
  season: number,
): Promise<Array<Team>> {
  const playoffTierSlug = REGIONAL_PLAYOFF_TIER_BY_TIER[tierSlug];
  const [regularSeasonCompetition, playoffsCompetition] = await Promise.all([
    DatabaseClient.prisma.competition.findFirst({
      where: {
        season,
        federation: {
          slug: federationSlug,
        },
        tier: {
          slug: tierSlug,
          league: {
            slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
          },
        },
      },
      include: {
        competitors: {
          orderBy: { position: 'asc' },
          include: { team: true },
        },
      },
    }),
    playoffTierSlug
      ? DatabaseClient.prisma.competition.findFirst({
          where: {
            season,
            federation: {
              slug: federationSlug,
            },
            tier: {
              slug: playoffTierSlug,
              league: {
                slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
              },
            },
          },
          include: {
            competitors: {
              orderBy: { position: 'asc' },
              include: { team: true },
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!regularSeasonCompetition) {
    return [];
  }

  const playoffCompetitors: CompetitionWithTeamCompetitors['competitors'] =
    playoffsCompetition?.competitors ?? [];
  const playoffTeamIds = new Set(playoffCompetitors.map((competitor) => competitor.teamId));

  return [
    ...playoffCompetitors.map((competitor) => competitor.team),
    ...regularSeasonCompetition.competitors
      .filter((competitor) => !playoffTeamIds.has(competitor.teamId))
      .map((competitor) => competitor.team),
  ];
}

async function getOccupiedRegionalTeamIds(federationSlug: Constants.FederationSlug) {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) {
    return new Set<number>();
  }

  const occupiedCompetitions = await DatabaseClient.prisma.competition.findMany({
    where: {
      season: profile.season,
      federation: {
        slug: federationSlug,
      },
      tier: {
        league: {
          slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
        },
        slug: {
          in: [...REGIONAL_LEAGUE_TIERS],
        },
      },
    },
    include: {
      competitors: true,
    },
  });

  return new Set(
    flatten(
      occupiedCompetitions.map((competition) =>
        competition.competitors.map((competitor) => competitor.teamId),
      ),
    ),
  );
}

async function getTopTeamsByElo(
  federationSlug: Constants.FederationSlug,
  start: number,
  end?: number,
  opts?: {
    countryFilter?: Prisma.CountryWhereInput | null;
    excludeIds?: Array<number>;
    prestigeSlug?: string;
    skip?: number;
    alternate?: 'even' | 'odd';
  },
): Promise<Array<Team>> {
  const prestigeIndex = opts?.prestigeSlug
    ? Constants.Prestige.findIndex((prestige) => prestige === opts.prestigeSlug)
    : -1;
  const teams = await DatabaseClient.prisma.team.findMany({
    where: {
      ...(prestigeIndex >= 0 ? { prestige: prestigeIndex } : {}),
      ...(opts?.excludeIds?.length
        ? {
            id: {
              notIn: opts.excludeIds,
            },
          }
        : {}),
      ...buildCompetitionFederationWhere(federationSlug, opts?.countryFilter),
    },
    orderBy: {
      elo: 'desc',
    },
  });

  let rankedTeams = teams;

  if (opts?.skip) {
    rankedTeams = rankedTeams.slice(opts.skip);
  }

  if (opts?.alternate === 'even') {
    rankedTeams = rankedTeams.filter((_, idx) => idx % 2 === 0);
  }

  if (opts?.alternate === 'odd') {
    rankedTeams = rankedTeams.filter((_, idx) => idx % 2 === 1);
  }

  return sliceRanked(rankedTeams, start, end);
}

async function getTeamsFromCompetitionEntry(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
): Promise<Array<Team>> {
  const profile = await DatabaseClient.prisma.profile.findFirst();
  if (!profile) {
    return [];
  }

  const countryFilter = buildCountryFilter(entry);
  const targetFederationSlug = (entry.federationSlug || federation.slug) as Constants.FederationSlug;
  const isWorldCircuitEntry = entry.from === Constants.LeagueSlug.ESPORTS_PRO_LEAGUE;

  const competition = await DatabaseClient.prisma.competition.findFirst({
    where: {
      season: profile.season + (entry.season || 0),
      tier: {
        slug: entry.target,
        league: {
          slug: entry.from,
        },
      },
      ...(isWorldCircuitEntry
        ? {}
        : {
            federation: {
              slug: targetFederationSlug,
            },
          }),
    },
    include: {
      competitors: {
        orderBy: { position: 'asc' },
        include: {
          team: true,
        },
      },
    },
  });

  if (!competition) {
    return [];
  }

  const regionTeams = await DatabaseClient.prisma.team.findMany({
    where: {
      id: {
        in: competition.competitors.map((competitor) => competitor.teamId),
      },
      ...buildCompetitionFederationWhere(targetFederationSlug, countryFilter),
    },
    select: {
      id: true,
    },
  });
  const regionTeamIds = new Set(regionTeams.map((team) => team.id));

  return sliceRanked(
    competition.competitors.filter((competitor) => regionTeamIds.has(competitor.teamId)),
    Number(entry.start),
    entry.end ? Number(entry.end) : undefined,
  ).map((competitor) => competitor.team);
}

async function handleIncludeAction(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
): Promise<Array<Team>> {
  return getTeamsFromCompetitionEntry(entry, federation);
}

async function handleExcludeAction(
  entry: Entry,
  federation: Prisma.FederationGetPayload<unknown>,
) {
  return getTeamsFromCompetitionEntry(entry, federation);
}

async function handleFallbackAction(
  entry: Entry,
  tier: Prisma.TierGetPayload<typeof Eagers.tier>,
  federation: Prisma.FederationGetPayload<unknown>,
) {
  const targetFederationSlug = (entry.federationSlug || federation.slug) as Constants.FederationSlug;
  const countryFilter = buildCountryFilter(entry);

  if (
    REGIONAL_LEAGUE_TIERS.has(entry.target) &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    if (profile) {
      const previousPlacements = await getRegionalLeaguePlacements(
        entry.target,
        targetFederationSlug,
        profile.season - 1,
      );

      if (previousPlacements.length) {
        const occupiedIds = await getOccupiedRegionalTeamIds(targetFederationSlug);
        return sliceRanked(
          previousPlacements.filter((team) => !occupiedIds.has(team.id)),
          Number(entry.start),
          entry.end ? Number(entry.end) : undefined,
        );
      }
    }

    const occupiedIds = [...(await getOccupiedRegionalTeamIds(targetFederationSlug))];
    return getTopTeamsByElo(
      targetFederationSlug,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      {
        countryFilter,
        excludeIds: occupiedIds,
        prestigeSlug: entry.target,
      },
    );
  }

  if (entry.target === Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1) {
    return getTopTeamsByElo(
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      { countryFilter, skip: 8 },
    );
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1) {
    return getTopTeamsByElo(
      Constants.FederationSlug.ESPORTS_EUROPA,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      { countryFilter, skip: 16 },
    );
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_A) {
    return getTopTeamsByElo(
      Constants.FederationSlug.ESPORTS_EUROPA,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      { countryFilter, alternate: 'even' },
    );
  }

  if (entry.target === Constants.TierSlug.MAJOR_EUROPE_RMR_B) {
    return getTopTeamsByElo(
      Constants.FederationSlug.ESPORTS_EUROPA,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      { countryFilter, alternate: 'odd' },
    );
  }

  if (
    entry.target === Constants.TierSlug.LEAGUE_PRO ||
    CUSTOM_INVITATIONAL_TIERS.has(entry.target) ||
    entry.from === Constants.LeagueSlug.ESPORTS_MAJOR
  ) {
    return getTopTeamsByElo(
      targetFederationSlug,
      Number(entry.start),
      entry.end ? Number(entry.end) : undefined,
      { countryFilter },
    );
  }

  const teams = await getTopTeamsByElo(
    targetFederationSlug,
    Number(entry.start),
    entry.end ? Number(entry.end) : undefined,
    {
      countryFilter,
      prestigeSlug: entry.target,
    },
  );

  if (!teams.length) {
    log.warn(
      'Could not backfill %s - %s. Found %d teams.',
      federation.name,
      tier.name,
      teams.length,
    );
  }

  return teams;
}

export async function parse(
  item: Item,
  tier: Prisma.TierGetPayload<typeof Eagers.tier>,
  federation: Prisma.FederationGetPayload<unknown>,
) {
  const tierSize =
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE
      ? Util.getLeagueTierSize(
          tier.slug as Constants.TierSlug,
          federation.slug as Constants.FederationSlug,
          tier.size,
        )
      : tier.size;

  const competitors = [] as Array<Team>;
  const allowsCrossFederationEntries =
    item.tierSlug === Constants.TierSlug.MAJOR_ASIA_RMR &&
    federation.slug === Constants.FederationSlug.ESPORTS_ASIA;
  const entryMatchesFederation = (entry: Entry) =>
    allowsCrossFederationEntries ||
    federation.slug === Constants.FederationSlug.ESPORTS_WORLD ||
    !entry.federationSlug ||
    entry.federationSlug === federation.slug;
  const eligibleEntries = item.entries.filter(entryMatchesFederation);

  const includeList = await Promise.all(
    flatten(
      eligibleEntries
        .filter((entry) => entry.action === Action.INCLUDE)
        .map((entry) => handleIncludeAction(entry, federation)),
    ),
  );

  const excludeList = await Promise.all(
    flatten(
      eligibleEntries
        .filter((entry) => entry.action === Action.EXCLUDE)
        .map((entry) => handleExcludeAction(entry, federation)),
    ),
  );

  let excludedCompetitors = flatten(excludeList);

  if (
    item.on === Constants.CalendarEntry.SEASON_START &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    federation.slug !== Constants.FederationSlug.ESPORTS_WORLD &&
    REGIONAL_LEAGUE_TIERS.has(item.tierSlug)
  ) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    if (profile) {
      const occupied = await DatabaseClient.prisma.competition.findMany({
        where: {
          season: profile.season,
          federation: { slug: federation.slug },
          tier: {
            league: { slug: Constants.LeagueSlug.ESPORTS_LEAGUE },
            slug: { in: [...REGIONAL_LEAGUE_TIERS] },
          },
        },
        include: {
          competitors: {
            include: {
              team: true,
            },
          },
        },
      });

      const occupiedTeams = flatten(
        occupied.map((competition) => competition.competitors.map((competitor) => competitor.team)),
      );
      excludedCompetitors = [...excludedCompetitors, ...occupiedTeams];
    }
  }

  competitors.push(...differenceBy(flatten(includeList), excludedCompetitors, 'id'));

  if (tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE) {
    const profile = await DatabaseClient.prisma.profile.findFirst();
    if (profile) {
      const eplCompetition = await DatabaseClient.prisma.competition.findFirst({
        where: {
          season: profile.season,
          tier: {
            slug: Constants.TierSlug.LEAGUE_PRO,
            league: {
              slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
            },
          },
        },
        include: {
          competitors: {
            include: {
              team: true,
            },
          },
        },
      });

      if (eplCompetition) {
        excludedCompetitors = [
          ...excludedCompetitors,
          ...eplCompetition.competitors.map((competitor) => competitor.team),
        ];
        competitors.splice(
          0,
          competitors.length,
          ...competitors.filter(
            (team) =>
              !eplCompetition.competitors.some((competitor) => competitor.teamId === team.id),
          ),
        );
      }
    }
  }

  const quota = eligibleEntries
    .filter((entry) => entry.action === Action.INCLUDE)
    .map((entry) =>
      entry.start < 0
        ? Math.abs(Number(entry.start))
        : (Number(entry.end || tierSize) - Math.max(0, Number(entry.start) - 1)),
    )
    .reduce((a, b) => a + b, 0);

  const requiredCount =
    item.tierSlug === Constants.TierSlug.LEAGUE_PRO ? quota || tierSize : Math.max(quota, tierSize);

  if (!requiredCount || competitors.length < requiredCount) {
    let fallbackList: Array<Team> = [];

    fallbackList = flatten(
      await Promise.all(
        eligibleEntries
          .filter((entry) => entry.action === Action.FALLBACK && typeof entry.season === 'number')
          .map((entry) => handleIncludeAction(entry, federation)),
      ),
    );

    if (!fallbackList.length || fallbackList.length < requiredCount - competitors.length) {
      fallbackList = flatten(
        await Promise.all(
          eligibleEntries
            .filter((entry) => entry.action === Action.FALLBACK && typeof entry.season !== 'number')
            .map((entry) => handleFallbackAction(entry, tier, federation)),
        ),
      );
    }

    competitors.push(
      ...differenceBy(fallbackList, [...competitors, ...excludedCompetitors], 'id'),
    );
  }

  if (
    item.on === Constants.CalendarEntry.SEASON_START &&
    tier.league.slug === Constants.LeagueSlug.ESPORTS_LEAGUE &&
    federation.slug !== Constants.FederationSlug.ESPORTS_WORLD &&
    REGIONAL_LEAGUE_TIERS.has(item.tierSlug) &&
    competitors.length < tierSize
  ) {
    const reservePool = await DatabaseClient.prisma.team.findMany({
      where: {
        id: {
          notIn: [...new Set([...competitors, ...excludedCompetitors].map((team) => team.id))],
        },
        ...buildCompetitionFederationWhere(federation.slug as Constants.FederationSlug),
      },
      orderBy: {
        elo: 'desc',
      },
    });

    competitors.push(...reservePool.slice(0, tierSize - competitors.length));
  }

  log.info(
    'Autofilled %s - %s with %d teams',
    federation.name,
    tier.name,
    competitors.slice(0, tierSize).length,
  );

  return Promise.resolve(competitors.slice(0, tierSize));
}
