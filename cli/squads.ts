/**
 * Export and import squads.
 *
 * @module
 */
import fs from 'node:fs';
import util from 'node:util';
import log from 'electron-log';
import { Command } from 'commander';
import { PrismaClient } from '@prisma/client';
import { camelCase, upperFirst } from 'lodash';
import { Constants } from '@liga/shared';

/** @interface */
interface CLIArguments {
  federationSlug: string;
  tier: string;
  out: string;
}

/**
 * Initialize the local prisma client.
 *
 * @constant
 */
const prisma = new PrismaClient();

/**
 * Default arguments.
 *
 * @constant
 */
const DEFAULT_ARGS: CLIArguments = {
  federationSlug: Constants.FederationSlug.ESPORTS_AMERICAS,
  tier: Constants.Prestige.findIndex(
    (tier) => tier === Constants.TierSlug.LEAGUE_PRO,
  ).toString(),
  out: null,
};

/**
 * Export squads subcommand.
 *
 * @function
 * @param args CLI args.
 */
async function squadsExport(args: typeof DEFAULT_ARGS) {
  const teams = await prisma.team.findMany({
    where: {
      country: {
        continent: {
          federation: {
            slug: args.federationSlug,
          },
        },
      },
      tier: Number(args.tier),
    },
    include: {
      country: true,
      players: {
        include: {
          country: true,
        },
      },
    },
  });

  return fs.promises.writeFile(args.out, JSON.stringify(teams, null, 4), 'utf8');
}

/**
 * Import squads subcommand.
 *
 * @function
 * @param args CLI args.
 */
async function squadsImport(args: typeof DEFAULT_ARGS) {
  // @todo
}

/**
 * Exports and imports squads.
 *
 * @function
 * @param type The type of function to run.
 * @param args CLI args.
 */
export async function handler(type: string, args: typeof DEFAULT_ARGS) {
  // bail early if provided function type is not supported
  const acceptedFnTypes = ['export', 'import'];
  const fns: Record<string, typeof squadsExport | typeof squadsImport> = {
    squadsExport,
    squadsImport,
  };

  if (!acceptedFnTypes.includes(type)) {
    return Promise.reject('Unknown function type.');
  }

  // dynamically call the scraper function
  try {
    const fn = util.format('squads%s', upperFirst(camelCase(type)));
    await fns[fn]({ ...DEFAULT_ARGS, ...args });
    return prisma.$disconnect();
  } catch (error) {
    log.error(error);
    return prisma.$disconnect();
  }
}

/**
 * Exports this module.
 *
 * @exports
 */
export default {
  /**
   * Registers this module's CLI.
   *
   * @function
   * @param program CLI parser.
   */
  register: (program: Command) => {
    program
      .command('squads')
      .description('Export and import squads.')
      .argument('<type>', 'The type of action.')
      .option('-f --federation <slug>', 'Federation slug', DEFAULT_ARGS.federationSlug)
      .option('-t --tier <number>', 'Tier/Division number', DEFAULT_ARGS.tier)
      .option('-o --out <string>', 'Where to save exports', DEFAULT_ARGS.out)
      .action(handler);
  },
};
