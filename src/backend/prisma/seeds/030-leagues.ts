/**
 * Seeds the database with leagues and tiers.
 *
 * @module
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { Constants } from '@liga/shared';

const InvitationalTierSlug = {
  BLAST_BOUNTY_SPRING: 'blast-bounty:spring',
  IEM_EVENT_1: 'iem:event-1',
  IEM_EVENT_2: 'iem:event-2',
  BLAST_OPEN_SPRING: 'blast-open:spring',
  BLAST_RIVALS_SPRING: 'blast-rivals:spring',
  PGL_BUCHAREST: 'pgl-bucharest',
  IEM_EVENT_3: 'iem:event-3',
  ESPORTS_WORLD_CUP: 'esports-world-cup',
  ESL_PRO_LEAGUE_SEASON_23: 'esl-pro-league:season-23',
  STARLADDER_STARSERIES: 'starladder-starseries',
  BLAST_BOUNTY_FALL: 'blast-bounty:fall',
  IEM_EVENT_4: 'iem:event-4',
  BLAST_OPEN_FALL: 'blast-open:fall',
  BLAST_RIVALS_FALL: 'blast-rivals:fall',
  THUNDERPICK_WORLD_CHAMPIONSHIP: 'thunderpick-world-championship',
  IEM_EVENT_5: 'iem:event-5',
  CS_ASIA_CHAMPIONSHIP: 'cs-asia-championship',
} as const;

const IEM_VENUES = [
  'Krakow',
  'Rio',
  'Atlanta',
  'Cologne',
  'China',
] as const;
const IEM_YEAR = 2026;
const IEM_EVENT_NAMES = IEM_VENUES.map((venue) => `IEM ${venue} ${IEM_YEAR}`);

/** @type {LeagueSeedData} */
type LeagueSeedData = Prisma.LeagueCreateInput & {
  tiers: Array<Prisma.TierCreateWithoutLeagueInput>;
  federations: Array<Constants.FederationSlug>;
};

/**
 * The seed data.
 *
 * @constant
 */
const data: Array<LeagueSeedData> = [
  {
    name: 'ESEA League',
    slug: Constants.LeagueSlug.ESPORTS_LEAGUE,
    startOffsetDays: 14,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
    ],
    tiers: [
      {
        name: 'ESEA Open',
        slug: Constants.TierSlug.LEAGUE_OPEN,
        size: 40,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
      },
      {
        name: 'ESEA Open Playoffs',
        slug: Constants.TierSlug.LEAGUE_OPEN_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 5,
      },
      {
        name: 'ESEA Intermediate',
        slug: Constants.TierSlug.LEAGUE_INTERMEDIATE,
        size: 30,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
      },
      {
        name: 'ESEA Intermediate Playoffs',
        slug: Constants.TierSlug.LEAGUE_INTERMEDIATE_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 5,
      },
      {
        name: 'ESEA Main',
        slug: Constants.TierSlug.LEAGUE_MAIN,
        size: 20,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
      },
      {
        name: 'ESEA Main Playoffs',
        slug: Constants.TierSlug.LEAGUE_MAIN_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 5,
      },
      {
        name: 'ESEA Advanced',
        slug: Constants.TierSlug.LEAGUE_ADVANCED,
        size: 20,
        groupSize: 20,
        triggerTierSlug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
      },
      {
        name: 'ESEA Advanced Playoffs',
        slug: Constants.TierSlug.LEAGUE_ADVANCED_PLAYOFFS,
        size: 4,
        triggerOffsetDays: 5,
      },
    ],
  },
  {
    name: 'Counter-Strike World Circuit',
    slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
    startOffsetDays: 21,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'BLAST Bounty Spring',
        slug: InvitationalTierSlug.BLAST_BOUNTY_SPRING,
        size: 16,
        lan: false,
        triggerTierSlug: InvitationalTierSlug.IEM_EVENT_1,
      },
      {
        name: IEM_EVENT_NAMES[0],
        slug: InvitationalTierSlug.IEM_EVENT_1,
        size: 14,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.IEM_EVENT_2,
      },
      {
        name: IEM_EVENT_NAMES[1],
        slug: InvitationalTierSlug.IEM_EVENT_2,
        size: 14,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.LEAGUE_PRO,
      },
      {
        name: 'ESL Pro League Season 22 Group Stage',
        slug: Constants.TierSlug.LEAGUE_PRO,
        size: 32,
        groupSize: 4,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
      },
      {
        name: 'ESL Pro League Season 22 Playoffs',
        slug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
        size: 16,
        lan: true,
        triggerOffsetDays: 8,
        triggerTierSlug: InvitationalTierSlug.BLAST_OPEN_SPRING,
      },
      {
        name: 'BLAST Open Spring',
        slug: InvitationalTierSlug.BLAST_OPEN_SPRING,
        size: 16,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.BLAST_RIVALS_SPRING,
      },
      {
        name: 'BLAST Rivals Spring',
        slug: InvitationalTierSlug.BLAST_RIVALS_SPRING,
        size: 8,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.PGL_BUCHAREST,
      },
      {
        name: 'PGL Bucharest',
        slug: InvitationalTierSlug.PGL_BUCHAREST,
        size: 8,
        lan: true,
        triggerOffsetDays: 12,
        triggerTierSlug: InvitationalTierSlug.IEM_EVENT_3,
      },
      {
        name: IEM_EVENT_NAMES[2],
        slug: InvitationalTierSlug.IEM_EVENT_3,
        size: 14,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.ESPORTS_WORLD_CUP,
      },
      {
        name: 'Esports World Cup',
        slug: InvitationalTierSlug.ESPORTS_WORLD_CUP,
        size: 16,
        lan: true,
        triggerOffsetDays: 12,
        triggerTierSlug: InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23,
      },
      {
        name: 'ESL Pro League Season 23',
        slug: InvitationalTierSlug.ESL_PRO_LEAGUE_SEASON_23,
        size: 16,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.STARLADDER_STARSERIES,
      },
      {
        name: 'StarLadder StarSeries',
        slug: InvitationalTierSlug.STARLADDER_STARSERIES,
        size: 8,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.BLAST_BOUNTY_FALL,
      },
      {
        name: 'BLAST Bounty Fall',
        slug: InvitationalTierSlug.BLAST_BOUNTY_FALL,
        size: 16,
        lan: false,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.IEM_EVENT_4,
      },
      {
        name: IEM_EVENT_NAMES[3],
        slug: InvitationalTierSlug.IEM_EVENT_4,
        size: 14,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.BLAST_OPEN_FALL,
      },
      {
        name: 'BLAST Open Fall',
        slug: InvitationalTierSlug.BLAST_OPEN_FALL,
        size: 16,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.BLAST_RIVALS_FALL,
      },
      {
        name: 'BLAST Rivals Fall',
        slug: InvitationalTierSlug.BLAST_RIVALS_FALL,
        size: 8,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.THUNDERPICK_WORLD_CHAMPIONSHIP,
      },
      {
        name: 'Thunderpick World Championship',
        slug: InvitationalTierSlug.THUNDERPICK_WORLD_CHAMPIONSHIP,
        size: 8,
        lan: true,
        triggerOffsetDays: 12,
        triggerTierSlug: InvitationalTierSlug.IEM_EVENT_5,
      },
      {
        name: IEM_EVENT_NAMES[4],
        slug: InvitationalTierSlug.IEM_EVENT_5,
        size: 14,
        lan: true,
        triggerOffsetDays: 10,
        triggerTierSlug: InvitationalTierSlug.CS_ASIA_CHAMPIONSHIP,
      },
      {
        name: 'CS Asia Championships',
        slug: InvitationalTierSlug.CS_ASIA_CHAMPIONSHIP,
        size: 8,
        lan: true,
        triggerOffsetDays: 10,
      },
    ],
  },
];

/**
 * The main seeder.
 *
 * @param prisma The prisma client.
 * @function
 */
export default async function (prisma: PrismaClient) {
  // grab all federations
  const federations = await prisma.federation.findMany();

  // build the transaction
  const transaction = data.map((league) =>
    prisma.league.upsert({
      where: { slug: league.slug },
      update: {
        name: league.name,
        slug: league.slug,
        startOffsetDays: league.startOffsetDays,
        federations: {
          connect: federations
            .filter((federation) =>
              league.federations.includes(federation.slug as Constants.FederationSlug),
            )
            .map((federation) => ({ id: federation.id })),
        },
        tiers: {
          upsert: league.tiers.map((tier) => ({
            where: {
              slug: tier.slug,
            },
            update: tier,
            create: tier,
          })),
        },
      },
      create: {
        name: league.name,
        slug: league.slug,
        startOffsetDays: league.startOffsetDays,
        federations: {
          connect: federations
            .filter((federation) =>
              league.federations.includes(federation.slug as Constants.FederationSlug),
            )
            .map((federation) => ({ id: federation.id })),
        },
        tiers: {
          create: league.tiers,
        },
      },
    }),
  );

  // run the transaction
  return prisma.$transaction(transaction);
}
