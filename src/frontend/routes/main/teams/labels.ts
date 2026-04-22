import { Constants, Util } from '@liga/shared';

const ESL_PRO_LEAGUE_NAME = 'ESL Pro League';

export const getTeamsTierLabel = (tierSlug: string, leagueName?: string, tierName?: string) => {
  const leagueLabel = leagueName ? Util.getCompetitionLeagueName(leagueName) : undefined;
  const tierLabel = tierName
    ? Util.getCompetitionTierName({ slug: tierSlug, name: tierName })
    : undefined;

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return leagueLabel ?? tierLabel ?? ESL_PRO_LEAGUE_NAME;
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return tierLabel ?? `${leagueLabel ?? ESL_PRO_LEAGUE_NAME} Playoffs`;
  }

  return tierLabel ?? Util.getCompetitionTierName(tierSlug);
};
