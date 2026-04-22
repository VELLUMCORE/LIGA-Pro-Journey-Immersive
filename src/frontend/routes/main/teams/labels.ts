import { Constants, Util } from '@liga/shared';

const ESL_PRO_LEAGUE_NAME = 'ESL Pro League';

export const getTeamsTierLabel = (tierSlug: string, leagueName?: string, tierName?: string) => {
  if (tierSlug === Constants.TierSlug.LEAGUE_PRO) {
    return leagueName ?? tierName ?? ESL_PRO_LEAGUE_NAME;
  }

  if (tierSlug === Constants.TierSlug.LEAGUE_PRO_PLAYOFFS) {
    return tierName ?? `${leagueName ?? ESL_PRO_LEAGUE_NAME} Playoffs`;
  }

  return tierName ?? Util.getCompetitionTierName(tierSlug);
};
