/**
 * The main browser window dashboard.
 *
 * @module
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInDays, differenceInMinutes, format, isSameDay } from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { calendarAdvance } from '@liga/frontend/redux/actions';
import { useTranslation } from '@liga/frontend/hooks';
import { Standings, Image, Historial } from '@liga/frontend/components';
import {
  FaCalendarDay,
  FaChartBar,
  FaCloudMoon,
  FaExclamationTriangle,
  FaForward,
  FaMapSigns,
  FaStop,
  FaStopwatch,
  FaStream,
} from 'react-icons/fa';

/** @interface */
interface StatusBannerProps {
  error: string;
}

/** @constant */
const NUM_UPCOMING = 5 + 1; // adds an extra for "next match"

/** @constant */
const NUM_PREVIOUS = 5;

/** @constant */
const LATE_SPECTATE_GRACE_MINUTES = 10;

/**
 * Application status error banner.
 *
 * @param props The root props.
 * @function
 */
export function StatusBanner(props: StatusBannerProps) {
  const t = useTranslation('windows');

  if (!props.error) {
    return null;
  }

  const error = React.useMemo(
    () => JSON.parse(props.error) as NodeJS.ErrnoException,
    [props.error],
  );

  // figure out which game is not installed
  const message = React.useMemo(() => {
    if (error.code !== Constants.ErrorCode.ENOENT && error.code !== Constants.ErrorCode.ERUNNING) {
      return;
    }

    const [, match] = error.path.match(/((?:csgo|cstrike|cs2|hl|steam)\.exe)/) || [];
    return match;
  }, [error]);

  const showSteamMissing =
    error.code === Constants.ErrorCode.ENOENT && message === Constants.GameSettings.STEAM_EXE;
  const showRunningError = error.code === Constants.ErrorCode.ERUNNING;
  const showPluginsError = !!error.path?.includes('plugins');

  if (!showSteamMissing && !showRunningError && !showPluginsError) {
    return null;
  }

  return (
    <section className="alert alert-warning flex h-8 justify-center rounded-none p-0">
      <FaExclamationTriangle />
      {showSteamMissing && (
        <p>
          {message} {t('main.dashboard.gameNotDetected')}
        </p>
      )}

      {showRunningError && (
        <p>
          {message} {t('main.dashboard.runningError')}
        </p>
      )}

      {showPluginsError && <p>{t('main.dashboard.pluginsError')}</p>}
    </section>
  );
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const t = useTranslation('windows');
  const { state, dispatch } = React.useContext(AppStateContext);
  const isIgl = React.useMemo(
    () => state.profile?.player?.role === Constants.UserRole.IGL,
    [state.profile],
  );
  const isBenched = React.useMemo(
    () => state.profile?.player?.transferListed === true,
    [state.profile],
  );
  const [settings, setSettings] = React.useState(Constants.Settings);
  const [upcoming, setUpcoming] = React.useState<
    Awaited<ReturnType<typeof api.matches.upcoming<typeof Eagers.match>>>
  >([]);
  const [matchHistorial, setMatchHistorial] = React.useState<Array<typeof upcoming>>([[], []]);
  const [previous, setPrevious] = React.useState<typeof upcoming>([]);
  const [worldRankings, setWorldRankings] = React.useState<Array<number>>([]);
  const [transfers, setTransfers] = React.useState<
    Awaited<ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>>
  >([]);

  const [dismissedNoTeamAdvanceWarning, setDismissedNoTeamAdvanceWarning] = React.useState(false);

  const canSkipDate = React.useMemo(() => Boolean(settings.general.dateSkippable), [settings.general.dateSkippable]);

  const toDashboardTeamTierLabel = (tierSlug: Constants.TierSlug): string =>
    tierSlug === Constants.TierSlug.LEAGUE_PRO
      ? 'ESL Pro League'
      : Constants.IdiomaticTier[tierSlug];

  const openPlayerTransferModal = React.useCallback((playerId: number) => {
    api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
      target: '/transfer',
      payload: playerId,
    });
  }, []);

  // load settings
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    setSettings(Util.loadSettings(state.profile.settings));
  }, [state.profile]);

  // reset one-time warning after switching profiles/saves
  React.useEffect(() => {
    setDismissedNoTeamAdvanceWarning(false);
  }, [state.profile?.id]);

  // fetch upcoming list of matches
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    if (!state.profile.teamId) {
      setUpcoming([]);
      return;
    }

    api.matches.upcoming(Eagers.match, NUM_UPCOMING).then(setUpcoming);
  }, [state.profile]);

  // fetch recent transfers
  React.useEffect(() => {
    if (!state.profile) {
      return;
    }

    api.transfers
      .all({
        include: Eagers.transfer.include,
        take: NUM_PREVIOUS,
        where: {
          status: {
            in: [
              Constants.TransferStatus.PLAYER_ACCEPTED,
              Constants.TransferStatus.TEAM_ACCEPTED,
            ],
          },
        },
        orderBy: {
          id: 'desc',
        },
      })
      .then(setTransfers);
  }, [state.profile]);

  // fetch previous matches if no upcoming matches
  React.useEffect(() => {
    const [nextMatch] = upcoming.slice(0, 1);

    if (!state.profile || !state.profile.teamId) {
      setPrevious([]);
      return;
    }

    if (nextMatch) {
      return;
    }

    api.matches.previous(Eagers.match, state.profile.teamId).then(setPrevious);
  }, [upcoming, state.profile]);

  const [spotlight] = React.useMemo(() => upcoming.slice(0, 1), [upcoming]);
  const featuredMatch = React.useMemo(() => spotlight || previous[0], [spotlight, previous]);
  const standings = React.useMemo(() => featuredMatch, [featuredMatch]);

  // fetch match facts for spotlight / latest match result
  React.useEffect(() => {
    if (!featuredMatch) {
      setMatchHistorial([[], []]);
      setWorldRankings([]);
      return;
    }

    Promise.all(
      featuredMatch.competitors.map((competitor) =>
        api.matches.previous(Eagers.match, competitor.teamId),
      ),
    ).then(setMatchHistorial);

    Promise.all(
      featuredMatch.competitors.map((competitor) => api.team.worldRanking(competitor.teamId)),
    ).then(setWorldRankings);
  }, [featuredMatch]);

  // fill in rows if not enough upcoming matches
  const upcomingFiller = React.useMemo(
    () => [...Array(Math.max(0, NUM_UPCOMING - (upcoming.length || 1)))],
    [upcoming],
  );

  const isFeaturedMatchday = React.useMemo(
    () =>
      Boolean(
        featuredMatch
        && state.profile
        && isSameDay(featuredMatch.date, state.profile.date),
      ),
    [featuredMatch, state.profile],
  );

  const featuredElapsedMinutes = React.useMemo(() => {
    if (!featuredMatch || !state.profile) {
      return null;
    }

    return differenceInMinutes(state.profile.date, featuredMatch.date);
  }, [featuredMatch, state.profile]);
  const featuredSeriesWindowMinutes = React.useMemo(
    () => Math.max(1, featuredMatch?.games?.length || 1) * 60,
    [featuredMatch],
  );
  const featuredKickoffReached = featuredElapsedMinutes != null && featuredElapsedMinutes >= 0;
  const featuredShouldSpectate =
    featuredElapsedMinutes != null
    && featuredElapsedMinutes >= LATE_SPECTATE_GRACE_MINUTES
    && featuredElapsedMinutes <= featuredSeriesWindowMinutes;
  const featuredResultOnly =
    featuredElapsedMinutes != null
    && featuredElapsedMinutes > featuredSeriesWindowMinutes;

  // grab user's team info
  const userTeam = React.useMemo(() => {
    if (!standings || !state.profile?.teamId) {
      return undefined;
    }

    return standings.competition.competitors.find(
      (competitor) => competitor.teamId === state.profile.teamId,
    );
  }, [standings, state.profile?.teamId]);

  // grab competitors by user's group
  const userGroupCompetitors = React.useMemo(() => {
    if (!standings || !standings.competition.tier.groupSize || !userTeam) {
      return undefined;
    }

    return standings.competition.competitors
      .filter((competitor) => competitor.group === userTeam.group)
      .sort((a, b) => a.position - b.position);
  }, [standings, userTeam]);

  return (
    <div className="dashboard">
      {/** PLAYING MODAL */}
      <dialog className={cx('modal', state.playing && 'modal-open')}>
        <section className="modal-box">
          <h3 className="text-lg">{t('main.dashboard.playingMatchTitle')}</h3>
          <p className="py-4">{t('main.dashboard.playingMatchSubtitle')}</p>
        </section>
      </dialog>

      {/** SETTINGS VALIDATION WARNING BANNER */}
      <StatusBanner error={state.appStatus} />

      {/** MAIN CONTENT */}
      <main>
        {/** LEFT COLUMN */}
        <div className="stack-y gap-0!">
          <section className="stack-y gap-0!">
            <header className="prose border-t-0!">
              <h2>{t('main.dashboard.headerUpcomingMatches')}</h2>
            </header>
            <table className="table table-fixed">
              <tbody>
                {upcoming.slice(1, NUM_UPCOMING).map((match) => {
                  const opponent = match.competitors.find(
                    (competitor) => competitor.teamId !== state.profile.teamId,
                  );
                  const competitionTierLabel = Util.getCompetitionTierName(match.competition.tier);
                  const competitionLeagueLabel = Util.getCompetitionLeagueName(match.competition.tier.league);
                  return (
                    <tr key={`${match.id}__match_upcoming`}>
                      <td className="w-1/6" title={format(match.date, 'PPPP p')}>
                        <div className="leading-tight">
                          <p>{format(match.date, 'MM/dd')}</p>
                          <small className="font-semibold opacity-80">{format(match.date, 'HH:mm')}</small>
                        </div>
                      </td>
                      <td className="w-3/6 truncate" title={opponent?.team?.name || '-'}>
                        <img
                          src={opponent?.team?.blazon || 'resources://blazonry/009400.png'}
                          className="mr-2 inline-block size-4"
                        />
                        <span>{opponent?.team.name || '-'}</span>
                      </td>
                      <td
                        className="w-2/6 truncate"
                        title={`${competitionLeagueLabel}: ${competitionTierLabel}`}
                      >
                        {competitionTierLabel}
                      </td>
                    </tr>
                  );
                })}
                {upcomingFiller.map((_, idx) => (
                  <tr key={`${idx}__filler_match_upcoming`} className="text-muted">
                    <td className="w-1/6">
                      {state.profile
                        ? format(
                          addDays(
                            !upcoming.length ? state.profile.date : upcoming.slice(-1)[0].date,
                            idx + 1,
                          ),
                          'MM/dd',
                        )
                        : '-'}
                    </td>
                    <td className="w-3/6 truncate">{t('main.dashboard.noMatchScheduled')}</td>
                    <td className="w-2/6">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="stack-y gap-0!">
            <header className="prose">
              <h2>{t('shared.standings')}</h2>
            </header>
            {!standings && (
              <article key="empty__standings" className="card h-32 rounded-none">
                <aside className="card-body items-center justify-center">
                  <p className="grow-0">{t('main.dashboard.noStandings')}</p>
                </aside>
              </article>
            )}
            {!!standings &&
              !!featuredMatch &&
              (() => {
                const featuredLeagueLabel = Util.getCompetitionLeagueName(featuredMatch.competition.tier.league);
                const featuredTierLabel = Util.getCompetitionTierName(featuredMatch.competition.tier);

                if (standings.competition.tier.groupSize && userTeam && userGroupCompetitors) {
                  return (
                    <article className="stack-y divide-base-content/10 !gap-0 divide-y">
                      <aside className="stack-x items-center px-2">
                        <Image
                          className="size-16"
                          src={Util.getCompetitionLogo(
                            featuredMatch.competition.tier.slug,
                            featuredMatch.competition.federation.slug,
                          )}
                        />
                        <header>
                          <h3>{featuredLeagueLabel}</h3>
                          <h4>{featuredTierLabel}</h4>
                          <h5>
                            {t('shared.matchday')} {featuredMatch.round}
                          </h5>
                        </header>
                      </aside>
                      <Standings
                        compact
                        highlight={state.profile.teamId}
                        competitors={userGroupCompetitors}
                        title={
                          standings.competition.tier.league.slug ===
                            Constants.LeagueSlug.ESPORTS_LEAGUE
                            ? Util.getCompetitionTierName(standings.competition.tier)
                            : `${t('shared.group')} ${Util.toAlpha(userTeam.group)}`
                        }
                        zones={
                          standings.competition.status ===
                          Constants.CompetitionStatus.STARTED &&
                          Util.getTierZonesByGroup(
                            standings.competition.tier.slug as Constants.TierSlug,
                            standings.competition.federation.slug as Constants.FederationSlug,
                            new Set(
                              standings.competition.competitors.map(
                                (competitor) => competitor.group,
                              ),
                            ).size,
                          )
                        }
                      />
                    </article>
                  );
                }

                if (standings.competition.tier.groupSize && !userTeam) {
                  return (
                    <article key="empty__standings_group" className="card h-32 rounded-none">
                      <aside className="card-body items-center justify-center">
                        <p className="grow-0">{t('main.dashboard.noStandings')}</p>
                      </aside>
                    </article>
                  );
                }

                return (
                  <article className="stack-y divide-base-content/10 !gap-0 divide-y">
                    <aside className="stack-x items-center px-2">
                      <Image
                        className="size-16"
                        src={Util.getCompetitionLogo(
                          featuredMatch.competition.tier.slug,
                          featuredMatch.competition.federation.slug,
                        )}
                      />
                      <header>
                        <h3>{featuredLeagueLabel}</h3>
                        <h4>{featuredTierLabel}</h4>
                        <h5>
                          {featuredMatch.competition.tier.groupSize
                            ? `${t('shared.matchday')} ${featuredMatch.round}`
                            : Constants.TierSwissConfig[featuredMatch.competition.tier.slug as Constants.TierSlug]
                              ? Util.parseSwissRound(featuredMatch.round)
                              : Util.parseCupRounds(featuredMatch.round, featuredMatch.totalRounds)}
                        </h5>
                      </header>
                    </aside>
                    <aside className="grid grid-cols-2 place-items-center">
                      {standings.competitors.map((competitor) => (
                        <header
                          key={`${competitor.id}__cup_splotlight_header`}
                          className="heading w-full border-y-0! py-2! text-center"
                        >
                          <p>{competitor.team.name}</p>
                        </header>
                      ))}
                    </aside>
                    <aside className="grid grid-cols-2 place-items-center pb-2">
                      {standings.competitors.map((competitor) => (
                        <figure key={`${competitor.id}__cup_splotlight`} className="center">
                          <Image
                            title={competitor.team.name}
                            src={competitor.team.blazon}
                            className="size-32"
                          />
                        </figure>
                      ))}
                    </aside>
                    <aside className="text-center">
                      <button
                        className="btn btn-block rounded-none border-x-0"
                        onClick={() => {
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/brackets',
                            payload: standings.competitionId,
                          });
                        }}
                      >
                        {t('main.dashboard.viewBracket')}
                      </button>
                    </aside>
                  </article>
                );
              })()}
          </section>
        </div>

        {/** RIGHT COLUMN */}
        <div className="stack-y gap-0!">
          <section className="divide-base-content/10 grid grid-cols-6 divide-x">
            <button
              title={canSkipDate ? 'Skip one day' : 'Career progression is locked to real time'}
              className={cx('day day-btn border-t-0', !canSkipDate && 'opacity-70')}
              disabled={!canSkipDate || state.working || state.playing}
              onClick={() => canSkipDate && dispatch(calendarAdvance(1))}
            >
              <figure>{canSkipDate ? <FaForward /> : <FaStopwatch />}</figure>
            </button>
            {!state.profile &&
              [...Array(5)].map((_, idx) => (
                <article
                  key={`${idx}__calendar_loading`}
                  className="day h-32 items-center justify-center border-t-0"
                >
                  <span className="loading loading-spinner loading-sm" />
                </article>
              ))}
            {!!state.profile &&
              [...Array(5)].map((_, idx) => {
                const today = addDays(state.profile.date, idx);
                const isActive = idx === 0;
                const entry = upcoming.find((match) => isSameDay(match.date, today));
                const opponent = entry?.competitors?.find(
                  (competitor) => competitor.teamId !== state.profile.teamId,
                );

                const trainingAllowed =
                  differenceInDays(today, state.profile.trainedAt || state.profile.date) ===
                  Constants.Application.TRAINING_FREQUENCY;

                return (
                  <article
                    key={`${idx}__calendar`}
                    className={cx('day border-t-0', isActive && 'day-active')}
                  >
                    <figure>
                      {isActive && (
                        <React.Fragment>
                          <p>{format(today, 'MMM')}</p>
                          <p>{format(today, 'y')}</p>
                        </React.Fragment>
                      )}
                      {!isActive && opponent && (
                        <img src={opponent.team.blazon} title={opponent.team.name} />
                      )}
                      {!isActive && !opponent ? (
                        trainingAllowed ? (
                          <FaStopwatch />
                        ) : (
                          <FaCloudMoon />
                        )
                      ) : null}
                    </figure>
                    <aside>
                      <h2>{format(today, 'd')}</h2>
                      <p>
                        {isActive && format(today, 'E')}
                        {!isActive && opponent && t('main.dashboard.match')}
                        {!isActive && !opponent
                          ? trainingAllowed
                            ? t('shared.training')
                            : t('main.dashboard.rest')
                          : ''}
                      </p>
                    </aside>
                  </article>
                );
              })}
          </section>
          <section className="divide-base-content/10 flex divide-x">
            <aside className="w-2/3">{(() => {
            // placeholder while things are loading
            // or if there are no matches
            if (!featuredMatch) {
              return (
                <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none! before:opacity-50!">
                  <figure>
                    <Image
                      className="h-full w-full"
                      src={Util.convertMapPool('de_dust2', Constants.Game.CSGO, true)}
                    />
                  </figure>
                  <article className="card-body items-center justify-center">
                    {t('main.dashboard.noMatch')}
                  </article>
                </section>
              );
            }

            const featuredCompetitors = featuredMatch.competitors.filter((competitor) => !!competitor?.team);
            const [home, away] = featuredCompetitors;

            if (!home || !away) {
              return (
                <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none! before:opacity-50!">
                  <figure>
                    <Image
                      className="h-full w-full"
                      src={Util.convertMapPool('de_dust2', Constants.Game.CSGO, true)}
                    />
                  </figure>
                  <article className="card-body items-center justify-center text-center">
                    {t('main.dashboard.noMatchScheduled')}
                  </article>
                </section>
              );
            }

            const featuredGames = featuredMatch.games || [];
            const activeGame = featuredGames.find(
              (game) => game.status !== Constants.MatchStatus.COMPLETED,
            ) || featuredGames[0];
            const [homeHistorial, awayHistorial] = matchHistorial;
            const [homeWorldRanking, awayWorldRanking] = worldRankings;
            const [homeSuffix, awaySuffix] = [home, away].map((competitor) => {
              if (!featuredMatch.competition.tier.groupSize || !userGroupCompetitors) {
                return toDashboardTeamTierLabel(Constants.Prestige[competitor.team.tier]);
              }

              const idx = userGroupCompetitors.findIndex(
                (entry) => entry.teamId === competitor.teamId,
              );
              if (idx === -1) {
                return toDashboardTeamTierLabel(Constants.Prestige[competitor.team.tier]);
              }

              return Util.toOrdinalSuffix(idx + 1);
            });
            const featuredLeagueLabel = Util.getCompetitionLeagueName(featuredMatch.competition.tier.league);
            const featuredTierLabel = Util.getCompetitionTierName(featuredMatch.competition.tier);
            const autoJoinStatusLabel = featuredResultOnly
              ? 'This series already finished before you arrived.'
              : featuredShouldSpectate
                ? `Server auto-connect is spectator-only after ${format(featuredMatch.date, 'HH:mm')}.`
                : featuredKickoffReached
                  ? 'Server should auto-connect as soon as the match window opens.'
                  : `Server will auto-connect at ${format(featuredMatch.date, 'HH:mm')}.`;

            return (
              <section className="card image-full card-sm h-80 flex-grow rounded-none before:rounded-none!">
                {featuredMatch.status === Constants.MatchStatus.PLAYING && (
                  <figure className="center absolute top-2 left-1/2 z-10 -translate-x-1/2 gap-1 uppercase">
                    <article className="inline-grid *:[grid-area:1/1]">
                      <span className="status status-error animate-ping" />
                      <span className="status status-error" />
                    </article>
                    <span>
                      <strong>Live&nbsp;</strong>
                      <em>
                        ({featuredMatch.competitors.map((competitor) => competitor.score).join(' - ')}
                        )
                      </em>
                    </span>
                  </figure>
                )}
                <figure>
                  <Image
                    className="h-full w-full"
                    src={
                      isIgl && isFeaturedMatchday && !featuredKickoffReached
                        ? 'resources://maps/allmaps.png'
                        : Util.convertMapPool(
                            activeGame?.map || 'de_dust2',
                            settings.general.game,
                            true,
                          )
                    }
                  />
                </figure>
                <article className="card-body">
                  <header className="grid h-full grid-cols-3 place-items-center">
                    <aside className="stack-y items-center">
                      <img src={home.team.blazon} className="h-24 w-auto" />
                      <span className="badge badge-lg">{Number(home.score ?? 0)}</span>
                      <Historial matches={homeHistorial} teamId={home.teamId} />
                      <div className="text-center">
                        <p>
                          {home.team.name}&nbsp;
                          <small title={t('shared.worldRanking')}>
                            (#{homeWorldRanking || 0})
                          </small>
                        </p>
                        <p>
                          <small>{homeSuffix}</small>
                        </p>
                      </div>
                    </aside>
                    <aside className="center h-full gap-4">
                      <Image
                        title={`${featuredLeagueLabel}: ${featuredTierLabel}`}
                        className="size-24"
                        src={Util.getCompetitionLogo(
                          featuredMatch.competition.tier.slug,
                          featuredMatch.competition.federation.slug,
                        )}
                      />
                      <p className="text-center">
                        <em>{format(featuredMatch.date, 'PPPP')}</em>
                        <br />
                        <strong>Start {format(featuredMatch.date, 'HH:mm')}</strong>
                      </p>
                      <ul>
                        <li className="stack-x items-center">
                          <FaMapSigns />
                          <span>
                            {Util.convertMapPool(
                              activeGame?.map || 'de_dust2',
                              settings.general.game,
                            )}
                          </span>
                        </li>
                        <li className="stack-x items-center">
                          <FaCalendarDay />
                          <span>
                            {featuredMatch.competition.tier.groupSize
                              ? `${t('shared.matchday')} ${featuredMatch.round}`
                              : Constants.TierSwissConfig[featuredMatch.competition.tier.slug as Constants.TierSlug]
                              ? Util.parseSwissRound(featuredMatch.round)
                              : Util.parseCupRounds(featuredMatch.round, featuredMatch.totalRounds)}
                          </span>
                        </li>
                        <li className="stack-x items-center">
                          <FaStream />
                          <span>
                            {t('shared.bestOf')}&nbsp;
                            {featuredGames.length || 1}
                          </span>
                        </li>
                        <li className="stack-x items-center">
                          <FaStopwatch />
                          <span>Kickoff {format(featuredMatch.date, 'HH:mm')}</span>
                        </li>
                      </ul>
                    </aside>
                    <aside className="stack-y items-center">
                      <img src={away.team.blazon} className="h-24 w-auto" />
                      <span className="badge badge-lg">{Number(away.score ?? 0)}</span>
                      <Historial matches={awayHistorial} teamId={away.teamId} />
                      <div className="text-center">
                        <p>
                          {away.team.name}&nbsp;
                          <small title="World Ranking">
                            (#{awayWorldRanking || 0})
                          </small>
                        </p>
                        <p>
                          <small>{awaySuffix}</small>
                        </p>
                      </div>
                    </aside>
                  </header>
                  <footer className="stack-y items-center gap-2 text-center">
                    <p className="text-sm opacity-85">{autoJoinStatusLabel}</p>
                  </footer>
                </article>
              </section>
            );
          })()}</aside>
          <aside className="w-1/3">
            <header className="heading prose max-w-none border-t-0!">
              <h2>Recent Transfers</h2>
            </header>
            <table className="table table-fixed">
              <tbody>
                {transfers.slice(0, NUM_PREVIOUS).map((transfer) => {
                  const latestOffer = transfer.offers[0];
                  const isContractExpiry = transfer.status === Constants.TransferStatus.EXPIRED;
                  const isFreeAgentTransfer =
                    transfer.status === Constants.TransferStatus.TEAM_ACCEPTED &&
                    (latestOffer?.cost || 0) === 0;
                  const destinationTeam = isContractExpiry ? transfer.from : transfer.to;
                  const isNoTeam =
                    isFreeAgentTransfer ||
                    !destinationTeam ||
                    destinationTeam.id == null ||
                    destinationTeam.name?.toLowerCase() === 'no team' ||
                    destinationTeam.blazon?.includes('noteam.svg');

                  return (
                    <tr key={`${transfer.id}__transfer_recent`}>
                      <td className="p-0 text-center">
                        <button
                          type="button"
                          className="mr-2 inline-block"
                          title={`View ${transfer.target.name}`}
                          onClick={() => openPlayerTransferModal(transfer.target.id)}
                        >
                          <img
                            title={transfer.target.name}
                            className="inline-block size-12"
                            src={transfer.target.avatar || 'resources://avatars/empty.png'}
                          />
                        </button>
                        {isNoTeam ? (
                          <img
                            title="No Team"
                            className="inline-block size-12"
                            src="resources://blazonry/noteam.svg"
                          />
                        ) : (
                          <Link to={`/teams?teamId=${destinationTeam.id}`}>
                            <img
                              title={destinationTeam.name}
                              className="inline-block size-12"
                              src={destinationTeam.blazon}
                            />
                          </Link>
                        )}
                      </td>
                      <td className="text-center">&rarr;</td>
                      <td className="p-0 text-center">
                        {isContractExpiry ? (
                          <img
                            title="No Team"
                            className="inline-block size-12"
                            src="resources://blazonry/noteam.svg"
                          />
                        ) : (
                          <Link to={`/teams?teamId=${transfer.from.id}`}>
                            <img
                              title={transfer.from.name}
                              className="inline-block size-12"
                              src={transfer.from.blazon}
                            />
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {[...Array(Math.max(0, NUM_PREVIOUS - transfers.length))].map((_, idx) => (
                  <tr key={`${idx}__filler_transfer_recent`} className="text-muted">
                    <td className="text-center">-</td>
                    <td className="text-center">&rarr;</td>
                    <td className="text-center">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </aside>
          </section>
          <section className="divide-base-content/10 grid grid-cols-2 divide-x">
            {((!!featuredMatch && featuredMatch.competitors) || [...Array(2)]).map(
              (competitor, competitorIdx) => {
                const teamId = competitor?.teamId;
                const matches = competitor ? (matchHistorial[competitorIdx] || []) : [];
                const previousFiller = [...Array(Math.max(0, NUM_PREVIOUS - matches.length))];
                return (
                  <article
                    key={`${competitor?.id}_${competitorIdx}__match_previous`}
                    className="stack-y gap-0!"
                  >
                    <header className="prose">
                      <h4 className="truncate">
                        {competitor?.team?.name}&nbsp;
                        {t('main.dashboard.headerRecentMatches')}
                      </h4>
                    </header>
                    <table className="table table-fixed">
                      <tbody>
                        {!!matches.length &&
                          matches.slice(0, NUM_PREVIOUS).map((match) => {
                            const opponent = match.competitors.find(
                              (c) => teamId != null && c.teamId !== teamId,
                            );
                            const result = match.competitors.find(
                              (c) => teamId != null && c.teamId === teamId,
                            )?.result;
                            const onClick =
                              match._count.events > 0
                                ? () =>
                                  api.window.send<ModalRequest>(
                                    Constants.WindowIdentifier.Modal,
                                    {
                                      target: '/postgame',
                                      payload: match.id,
                                    },
                                  )
                                : null;
                            const competitionTierLabel = Util.getCompetitionTierName(match.competition.tier);
                            const competitionLeagueLabel = Util.getCompetitionLeagueName(match.competition.tier.league);

                            return (
                              <tr
                                key={`${match.id}__match_previous`}
                                onClick={onClick}
                                className={cx(onClick && 'hover:bg-base-content/10 cursor-pointer')}
                              >
                                <td
                                  className={cx('w-1/12', !onClick && 'text-muted')}
                                  title={
                                    onClick
                                      ? t('shared.viewMatchDetails')
                                      : t('shared.noMatchDetails')
                                  }
                                >
                                  <FaChartBar />
                                </td>
                                <td className="w-1/12" title={format(match.date, 'PPPP')}>
                                  {format(match.date, 'MM/dd')}
                                </td>
                                <td
                                  className={cx(
                                    'w-3/12 text-center',
                                    Util.getResultTextColor(result),
                                  )}
                                >
                                  {match.competitors
                                    .map((competitor) => competitor.score)
                                    .join(' : ') || '-'}
                                </td>
                                <td className="w-4/12 truncate" title={opponent?.team?.name || '-'}>
                                  {!!opponent?.team && (
                                    <img
                                      className="mr-2 inline-block size-4"
                                      src={
                                        opponent?.team?.blazon || 'resources://blazonry/009400.png'
                                      }
                                    />
                                  )}
                                  <span>{opponent?.team?.name || 'BYE'}</span>
                                </td>
                                <td
                                  className="w-3/12 truncate"
                                  title={`${competitionLeagueLabel}: ${competitionTierLabel}`}
                                >
                                  {competitionTierLabel}
                                </td>
                              </tr>
                            );
                          })}
                        {previousFiller.map((_, idx) => (
                          <tr key={`${idx}__filler_match_previous`} className="text-muted">
                            <td className="w-1/12">
                              {state.profile
                                ? format(
                                  addDays(
                                    !matches.length
                                      ? state.profile.date
                                      : matches.slice(-1)[0].date,
                                    idx - 1,
                                  ),
                                  'MM/dd',
                                )
                                : '-'}
                            </td>
                            <td className="w-4/12 text-center">-</td>
                            <td className="w-4/12">{t('shared.noRecentMatch')}</td>
                            <td className="w-3/12">-</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </article>
                );
              },
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
