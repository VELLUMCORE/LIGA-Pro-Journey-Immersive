/**
 * Seeds the database with leagues and tiers.
 *
 * @module
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { Constants } from '@liga/shared';

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
    name: 'ESL Pro League',
    slug: Constants.LeagueSlug.ESPORTS_PRO_LEAGUE,
    startOffsetDays: 63,
    federations: [Constants.FederationSlug.ESPORTS_WORLD],
    tiers: [
      {
        name: 'Conference Stage',
        slug: Constants.TierSlug.LEAGUE_PRO,
        size: 32,
        groupSize: 4,
        triggerTierSlug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
      },
      {
        name: 'Playoffs',
        slug: Constants.TierSlug.LEAGUE_PRO_PLAYOFFS,
        size: 16,
        triggerOffsetDays: 5,
      },
    ],
  },
  {
    name: 'BLAST.tv Austin Major',
    slug: Constants.LeagueSlug.ESPORTS_MAJOR,
    startOffsetDays: 5,
    federations: [
      Constants.FederationSlug.ESPORTS_AMERICAS,
      Constants.FederationSlug.ESPORTS_ASIA,
      Constants.FederationSlug.ESPORTS_EUROPA,
      Constants.FederationSlug.ESPORTS_OCE,
      Constants.FederationSlug.ESPORTS_WORLD,
    ],
    tiers: [
      {
        name: 'Austin Major Asia Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_1,
        size: 62,
        triggerTierSlug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
      },
      {
        name: 'Austin Major Asia Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_ASIA_OPEN_QUALIFIER_2,
        size: 60,
        triggerOffsetDays: 2,
      },
      {
        name: 'Austin Major China Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_1,
        size: 32,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
      },
      {
        name: 'Austin Major China Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_CHINA_OPEN_QUALIFIER_2,
        size: 30,
        triggerOffsetDays: 2,
      },
      {
        name: 'Austin Major Americas Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_1,
        size: 102,
        triggerTierSlug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
      },
      {
        name: 'Austin Major Americas Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_AMERICAS_OPEN_QUALIFIER_2,
        size: 98,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
      },
      {
        name: 'Austin Major Americas MRQ',
        slug: Constants.TierSlug.MAJOR_AMERICAS_RMR,
        size: 16,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
      },
      {
        name: 'Austin Major Europe Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_1,
        size: 94,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
      },
      {
        name: 'Austin Major Europe Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_2,
        size: 90,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
      },
      {
        name: 'Austin Major Europe Open Qualifier #3',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_3,
        size: 86,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
      },
      {
        name: 'Austin Major Europe Open Qualifier #4',
        slug: Constants.TierSlug.MAJOR_EUROPE_OPEN_QUALIFIER_4,
        size: 82,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
      },
      {
        name: 'Austin Major Europe MRQ A',
        slug: Constants.TierSlug.MAJOR_EUROPE_RMR_A,
        size: 16,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
      },
      {
        name: 'Austin Major Europe MRQ B',
        slug: Constants.TierSlug.MAJOR_EUROPE_RMR_B,
        size: 16,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
      },
      {
        name: 'Austin Major Oceania Open Qualifier #1',
        slug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_1,
        size: 36,
        triggerTierSlug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
      },
      {
        name: 'Austin Major Oceania Open Qualifier #2',
        slug: Constants.TierSlug.MAJOR_OCE_OPEN_QUALIFIER_2,
        size: 35,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_ASIA_RMR,
      },
      {
        name: 'Austin Major Asia-Pacific MRQ',
        slug: Constants.TierSlug.MAJOR_ASIA_RMR,
        size: 8,
        triggerOffsetDays: 10,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
      },
      {
        name: 'Austin Major Stage 1',
        slug: Constants.TierSlug.MAJOR_CHALLENGERS_STAGE,
        size: 16,
        triggerOffsetDays: 35,
        triggerTierSlug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
      },
      {
        name: 'Austin Major Stage 2',
        slug: Constants.TierSlug.MAJOR_LEGENDS_STAGE,
        size: 16,
        triggerOffsetDays: 2,
        triggerTierSlug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
      },
      {
        name: 'Austin Major Playoffs',
        slug: Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
        size: 8,
        triggerOffsetDays: 3,
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
