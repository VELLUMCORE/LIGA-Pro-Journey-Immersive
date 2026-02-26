/**
 * Lobby Free Agent Seeder.
 *
 * Imports a list of names and appends them as free agents for a federation,
 * assigning random country, role/personality, XP and ELO.
 */
import fs from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { Command } from 'commander';
import { Prisma, PrismaClient } from '@prisma/client';
import { random } from 'lodash';
import { Chance, Constants, PersonalityTemplate, PlayerRole } from '@liga/shared';

interface SeedEntry {
  name: string;
  countryCode?: string;
}

interface CLIArguments {
  file: string;
  federation?: string;
  minElo?: string;
  maxElo?: string;
  minXp?: string;
  maxXp?: string;
  dryRun?: boolean;
}

const prisma = new PrismaClient();

const DEFAULT_ARGS: Omit<CLIArguments, 'file'> = {
  federation: 'asia',
  minElo: '100',
  maxElo: '1900',
  minXp: '4',
  maxXp: '20',
  dryRun: false,
};

const COUNTRY_WEIGHTS: Record<string, Record<string, number | 'auto'>> = {
  [Constants.FederationSlug.ESPORTS_ASIA]: {
    ae: 1,
    cn: 35,
    id: 2,
    in: 4,
    ir: 1,
    jp: 3,
    kr: 5,
    my: 1,
    ph: 1,
    sa: 2,
    sg: 1,
    th: 2,
    hk: 4,
    tw: 2,
    vn: 4,
    mn: 45,
  },
  [Constants.FederationSlug.ESPORTS_EUROPA]: {
    de: 5,
    uk: 5,
    pl: 5,
    fr: 5,
    cz: 5,
    se: 5,
    fi: 5,
    no: 5,
    lv: 5,
    dk: 15,
    tr: 10,
    al: 3,
    xk: 2,
    ro: 5,
    es: 5,
    pt: 5,
    lt: 5,
    si: 2,
    sk: 2,
    be: 1,
  },
  [Constants.FederationSlug.ESPORTS_AMERICAS]: {
    de: 5,
    uk: 5,
    pl: 5,
    fr: 5,
    cz: 5,
    se: 5,
    fi: 5,
    no: 5,
    lv: 5,
    dk: 15,
    tr: 10,
    al: 3,
    xk: 2,
    ro: 5,
    es: 5,
    pt: 5,
    lt: 5,
    si: 2,
    sk: 2,
    be: 1,
  },
  [Constants.FederationSlug.ESPORTS_OCE]: {
    au: 90,
    nz: 10,
  },
};

function normalizeFederation(federationInput: string): Constants.FederationSlug {
  const raw = federationInput.toLowerCase();
  switch (raw) {
    case 'asia':
    case 'esports_asia':
      return Constants.FederationSlug.ESPORTS_ASIA;
    case 'eu':
    case 'europe':
    case 'europa':
    case 'esports_europa':
      return Constants.FederationSlug.ESPORTS_EUROPA;
    case 'americas':
    case 'america':
    case 'na':
    case 'sam':
    case 'esports_americas':
      return Constants.FederationSlug.ESPORTS_AMERICAS;
    case 'oce':
    case 'oceania':
    case 'esports_oce':
      return Constants.FederationSlug.ESPORTS_OCE;
    default:
      throw new Error(`Unsupported federation: ${federationInput}`);
  }
}

function getRandomRiflePersonality(): PersonalityTemplate {
  const pool = [
    PersonalityTemplate.LURK,
    PersonalityTemplate.ALURK,
    PersonalityTemplate.PLURK,
    PersonalityTemplate.ARIFLE,
    PersonalityTemplate.RIFLE,
    PersonalityTemplate.PRIFLE,
    PersonalityTemplate.ENTRY,
  ];
  return pool[random(0, pool.length - 1)];
}

function getRandomSniperPersonality(): PersonalityTemplate {
  const pool = [
    PersonalityTemplate.ASNIPER,
    PersonalityTemplate.SNIPER,
    PersonalityTemplate.PSNIPER,
  ];
  return pool[random(0, pool.length - 1)];
}

function parseNames(filePath: string): SeedEntry[] {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Input file not found: ${abs}`);
  }

  const raw = fs.readFileSync(abs, 'utf8').trim();
  if (!raw.length) return [];

  // JSON input: ["name"] or [{"name":"...","countryCode":"..."}]
  if (abs.endsWith('.json')) {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('JSON file must contain an array.');
    }

    const normalized = parsed
      .map((item): SeedEntry | null => {
        if (typeof item === 'string') {
          return { name: item.trim() };
        }

        if (item && typeof item === 'object' && typeof item.name === 'string') {
          return {
            name: item.name.trim(),
            countryCode:
              typeof item.countryCode === 'string' ? item.countryCode.trim().toLowerCase() : undefined,
          };
        }

        return null;
      })
      .filter((item): item is SeedEntry => Boolean(item && item.name.length > 0));

    return normalized;
  }

  // text/csv input: one name per line
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

export async function seedLobbies(args: CLIArguments) {
  const options = { ...DEFAULT_ARGS, ...args };
  const federationSlug = normalizeFederation(options.federation || 'asia');
  const minElo = parseInt(options.minElo || DEFAULT_ARGS.minElo || '100', 10);
  const maxElo = parseInt(options.maxElo || DEFAULT_ARGS.maxElo || '1900', 10);
  const minXp = parseInt(options.minXp || DEFAULT_ARGS.minXp || '4', 10);
  const maxXp = parseInt(options.maxXp || DEFAULT_ARGS.maxXp || '20', 10);

  if (Number.isNaN(minElo) || Number.isNaN(maxElo) || minElo > maxElo) {
    throw new Error('Invalid ELO range.');
  }

  if (Number.isNaN(minXp) || Number.isNaN(maxXp) || minXp > maxXp) {
    throw new Error('Invalid XP range.');
  }

  const entries = parseNames(options.file)
    .map((item) => ({ name: item.name.trim(), countryCode: item.countryCode?.toLowerCase() }))
    .filter((item) => item.name.length > 0);

  const uniqueByName = new Map<string, SeedEntry>();
  for (const entry of entries) {
    const key = entry.name.toLowerCase();
    if (!uniqueByName.has(key)) uniqueByName.set(key, entry);
  }

  const dedupedEntries = Array.from(uniqueByName.values());

  const federation = await prisma.federation.findFirst({
    where: { slug: federationSlug },
    include: {
      continents: {
        include: {
          countries: true,
        },
      },
    },
  });

  if (!federation) {
    throw new Error(`Federation not found: ${federationSlug}`);
  }

  const countries = federation.continents.flatMap((continent) => continent.countries);
  if (!countries.length) {
    throw new Error(`No countries mapped to federation: ${federationSlug}`);
  }

  const countryWeights = { ...(COUNTRY_WEIGHTS[federationSlug] || {}) };
  for (const country of countries) {
    const code = country.code.toLowerCase();
    if (!(code in countryWeights)) {
      countryWeights[code] = 'auto';
    }
  }

  const existingPlayers = await prisma.player.findMany({
    where: {
      name: {
        in: dedupedEntries.map((entry) => entry.name),
      },
    },
    select: { name: true },
  });
  const existingSet = new Set(existingPlayers.map((player) => player.name.toLowerCase()));

  const toInsert = dedupedEntries.filter((entry) => !existingSet.has(entry.name.toLowerCase()));

  const countryByCode = new Map(countries.map((country) => [country.code.toLowerCase(), country.id]));

  const createData: Prisma.PlayerUncheckedCreateInput[] = toInsert.map((entry) => {
    const forcedCountryId = entry.countryCode ? countryByCode.get(entry.countryCode) : undefined;
    const randomCountryPick = Chance.roll(countryWeights);
    const randomCountryId = countryByCode.get(String(randomCountryPick).toLowerCase()) || countries[0].id;
    const countryId = forcedCountryId || randomCountryId;

    const isSniper = Math.random() < 0.2;
    const role = isSniper ? PlayerRole.SNIPER : PlayerRole.RIFLER;
    const personality = isSniper ? getRandomSniperPersonality() : getRandomRiflePersonality();

    return {
      name: entry.name,
      countryId,
      transferListed: true,
      starter: false,
      xp: random(minXp, maxXp),
      elo: random(minElo, maxElo),
      role,
      personality,
      age: random(17, 30),
    };
  });

  log.info('Lobby Seeder: %d parsed, %d existing skipped, %d new inserts.', dedupedEntries.length, existingPlayers.length, createData.length);

  if (!createData.length) {
    log.info('No new players to add.');
    return;
  }

  if (options.dryRun) {
    log.info('Dry run enabled. No DB writes performed.');
    return;
  }

  await prisma.$transaction(createData.map((data) => prisma.player.create({ data })));

  log.info('Lobby seeding complete for federation %s.', federationSlug);
}

export default {
  register: (program: Command) => {
    program
      .command('lobbies')
      .description('Append free-agent lobby players from a names file.')
      .requiredOption('-f --file <path>', 'Path to .json/.txt names file')
      .option('--federation <slug>', 'Federation (asia|eu|americas|oce)', DEFAULT_ARGS.federation)
      .option('--min-elo <num>', 'Minimum ELO assigned to seeded players', DEFAULT_ARGS.minElo)
      .option('--max-elo <num>', 'Maximum ELO assigned to seeded players', DEFAULT_ARGS.maxElo)
      .option('--min-xp <num>', 'Minimum XP assigned to seeded players', DEFAULT_ARGS.minXp)
      .option('--max-xp <num>', 'Maximum XP assigned to seeded players', DEFAULT_ARGS.maxXp)
      .option('--dry-run', 'Parse and validate without writing to DB', DEFAULT_ARGS.dryRun)
      .action(async (opts: CLIArguments) => {
        try {
          await seedLobbies(opts);
        } finally {
          await prisma.$disconnect();
        }
      });
  },
};
