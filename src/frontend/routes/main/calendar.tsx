/**
 * Calendar route.
 *
 * @module
 */
import React from 'react';
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDay,
  isSameDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { Constants, Eagers, Util } from '@liga/shared';
import { AppStateContext } from '@liga/frontend/redux';
import { play, profileUpdate } from '@liga/frontend/redux/actions';
import { cx } from '@liga/frontend/lib';
import { useTranslation } from '@liga/frontend/hooks';
import { Image } from '@liga/frontend/components';
import { FaArrowCircleLeft, FaArrowCircleRight, FaCalendarDay } from 'react-icons/fa';

/** @type {MatchesResponse} */
type MatchesResponse = Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>;

/** @constant */
const DAYS_PER_WEEK = 7;

/** @constant */
const WEEKS_PER_MONTH = 6;

function getCompetitionMode(match: MatchesResponse[number]) {
  const isLan = Boolean(match.competition?.tier?.lan);
  return {
    mode: isLan ? 'Offline (LAN)' : 'Online',
    venue: isLan
      ? `${match.competition?.federation?.name || 'Global'} LAN studio / arena`
      : `${match.competition?.federation?.name || 'Global'} online server`,
  };
}

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  // grab today's date
  const t = useTranslation('windows');
  const { state, dispatch } = React.useContext(AppStateContext);
  const [current, setCurrent] = React.useState(state.profile?.date || new Date());
  const [spotlight, setSpotlight] = React.useState<MatchesResponse[number]>();
  const [appInfo, setAppInfo] = React.useState<{ isDev?: boolean } | null>(null);
  const [debugTimeValue, setDebugTimeValue] = React.useState('12:00');
  const today = React.useMemo(() => state.profile?.date || new Date(), [state.profile]);
  const settings = React.useMemo(() => Util.loadSettings(state.profile?.settings), [state.profile?.settings]);
  const debugEnabled = Boolean(appInfo?.isDev && (settings.general as any).debug);

  // start and end of the month
  const start = React.useMemo(() => startOfMonth(current), [current]);
  const end = React.useMemo(() => endOfMonth(current), [current]);

  // actual days of the current month
  const days = React.useMemo(() => eachDayOfInterval({ start, end }), [start, end]);

  // grab the days of the week to render at the
  // top of the calendar ("sun", "mon", etc)
  const weekdays = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(new Date()),
        end: endOfWeek(new Date()),
      }),
    [],
  );

  // padding for beginning and end of the month
  const paddingStart = React.useMemo(() => Array(getDay(start)).fill(null), [start]);
  const paddingEnd = React.useMemo(
    () => Array(42 - (paddingStart.length + days.length)).fill(null),
    [paddingStart, days],
  );

  // build the calendar data object
  const calendar = React.useMemo(
    () =>
      Array.from({ length: WEEKS_PER_MONTH }).map((_, weekIdx) =>
        [...paddingStart, ...days, ...paddingEnd].slice(
          weekIdx * DAYS_PER_WEEK,
          weekIdx * DAYS_PER_WEEK + DAYS_PER_WEEK,
        ),
      ),
    [paddingStart, days, paddingEnd],
  );

  // grab the match data for the current month
  const [matches, setMatches] = React.useState<MatchesResponse>([]);
  const [worldMatches, setWorldMatches] = React.useState<MatchesResponse>([]);

  React.useEffect(() => {
    api.app.info().then((info: any) => setAppInfo(info)).catch(() => setAppInfo(null));
  }, []);

  React.useEffect(() => {
    api.matches
      .all({
        ...Eagers.match,
        where: {
          date: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
          ...(state.profile?.teamId
            ? {
              competitors: {
                some: {
                  teamId: state.profile?.teamId,
                },
              },
            }
            : {}),
        },
      })
      .then(setMatches);

    api.matches
      .all({
        ...Eagers.match,
        where: {
          competitionId: {
            not: null,
          },
          date: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
        },
      })
      .then(setWorldMatches);
  }, [start, end, state.profile]);

  // load spotlight on initial fetch of matches
  React.useEffect(() => {
    const matchday = matches.find((match) => isSameDay(match.date, current));

    if (spotlight || !matchday) {
      return;
    }

    setSpotlight(matchday);
  }, [matches]);

  React.useEffect(() => {
    const source = spotlight || matches.find((match) => isSameDay(match.date, current));
    const nextDate = source?.date ? new Date(source.date) : current;
    setDebugTimeValue(format(nextDate, 'HH:mm'));
  }, [spotlight, matches, current]);

  const selectedDate = spotlight?.date || current;
  const selectedDateDiffersFromToday = React.useMemo(
    () => differenceInCalendarDays(selectedDate, today) !== 0,
    [selectedDate, today],
  );
  const matchesOnSelectedDay = React.useMemo(
    () => worldMatches.filter((match) => isSameDay(match.date, selectedDate)),
    [worldMatches, selectedDate],
  );

  const spotlightIsUserUpcoming = Boolean(
    spotlight &&
      spotlight.status !== Constants.MatchStatus.COMPLETED &&
      spotlight.competitors.some((competitor) => competitor.teamId === state.profile?.teamId),
  );

  const applyReschedule = async () => {
    if (!spotlight) return;
    const updated = await api.debug.rescheduleMatch(spotlight.id, debugTimeValue);
    setSpotlight(updated as MatchesResponse[number]);
    setMatches((prev) => prev.map((match) => (match.id === spotlight.id ? (updated as MatchesResponse[number]) : match)));
    setWorldMatches((prev) => prev.map((match) => (match.id === spotlight.id ? (updated as MatchesResponse[number]) : match)));
  };

  const goToSelectedDay = async () => {
    await api.ipc.invoke('/debug/go-to-day', selectedDate.toISOString());
    const profile = await api.profiles.current();
    dispatch(profileUpdate(profile));
    setCurrent(new Date(profile.date));
  };

  return (
    <div className="dashboard">
      <header>
        <button
          disabled={start.toISOString() === startOfMonth(today).toISOString()}
          onClick={() => setCurrent(today)}
        >
          <FaCalendarDay />
          {'Today'}
        </button>
        <button onClick={() => setCurrent(subMonths(current, 1))}>
          <FaArrowCircleLeft />
          {'Previous'}
        </button>
        <button onClick={() => setCurrent(addMonths(current, 1))}>
          {'Next'}
          <FaArrowCircleRight />
        </button>
        <button className="ml-auto">{format(current, 'MMMM yyyy')}</button>
        {debugEnabled && selectedDateDiffersFromToday && (
          <button type="button" onClick={() => void goToSelectedDay()}>
            Go to this day
          </button>
        )}
      </header>
      <main>
        <section>
          {(() => {
            if (!spotlight) {
              return (
                <article>
                  <header className="prose border-t-0!">
                    <h2>{format(current, 'PPP')}</h2>
                  </header>
                  <footer className="stack-y min-h-24 p-3">
                    <p>Click on a date to view match details.</p>
                    {matchesOnSelectedDay.slice(0, 8).map((fixture) => (
                      <div key={`fixture-empty-${fixture.id}`} className="flex items-center justify-between text-xs">
                        <span>
                          {format(fixture.date, 'p')} · {fixture.competitors.map((c) => c.team?.name || 'TBD').join(' vs ')} · {Util.getCompetitionTierName(fixture.competition.tier)}
                        </span>
                        {fixture.status !== Constants.MatchStatus.COMPLETED && isSameDay(fixture.date, today) && (
                          <button className="btn btn-xs" onClick={() => dispatch(play(fixture.id, true))}>Spectate</button>
                        )}
                      </div>
                    ))}
                  </footer>
                </article>
              );
            }

            const opponent = spotlight.competitors.find(
              (competitor) => competitor.teamId !== state.profile.teamId,
            );

            return (
              <article className="stack-y">
                <header className="prose border-t-0!">
                  <h2>{format(spotlight.date, 'PPP')}</h2>
                </header>
                <footer className="stack-y divide-base-content/10 !gap-0 divide-y">
                  <aside className="stack-x items-center px-2">
                    <Image
                      className="size-16"
                      src={Util.getCompetitionLogo(
                        spotlight.competition.tier.slug,
                        spotlight.competition.federation.slug,
                      )}
                    />
                    <header>
                      <h3>{spotlight.competition.tier.league.name}</h3>
                      <h4>{Util.getCompetitionTierName(spotlight.competition.tier)}</h4>
                      <h5>
                        {spotlight.competition.tier.groupSize
                          ? `${t('shared.matchday')} ${spotlight.round}`
                          : Util.parseCupRounds(spotlight.round, spotlight.totalRounds)}
                      </h5>
                      <p>{format(spotlight.date, 'p')}</p>
                      <p>{getCompetitionMode(spotlight).mode} · {getCompetitionMode(spotlight).venue}</p>
                    </header>
                  </aside>
                  <aside className="center gap-2 pb-2">
                    <header className="heading w-full border-t-0! py-2! text-center">
                      <p>{opponent.team.name}</p>
                    </header>
                    <Image
                      title={opponent.team.name}
                      src={opponent.team.blazon}
                      className="size-32"
                    />
                    {spotlight.status === Constants.MatchStatus.COMPLETED && (
                      <span
                        className={cx(
                          'badge',
                          ['badge-error', 'badge-ghost', 'badge-success'][opponent.result],
                        )}
                      >
                        {spotlight.competitors.map((competitor) => competitor.score).join('-')}
                      </span>
                    )}
                  </aside>
                  <aside className="join">
                    {!spotlight.competition.tier.groupSize && (
                      <button
                        className="btn join-item flex-1 rounded-none"
                        onClick={() => {
                          api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                            target: '/brackets',
                            payload: spotlight.competitionId,
                          });
                        }}
                      >
                        {t('main.dashboard.viewBracket')}
                      </button>
                    )}
                    <button
                      className="btn join-item flex-1 rounded-none"
                      disabled={!spotlight._count.events}
                      title={
                        spotlight._count.events > 0
                          ? t('shared.viewMatchDetails')
                          : t('shared.noMatchDetails')
                      }
                      onClick={() =>
                        spotlight._count.events > 0 &&
                        api.window.send<ModalRequest>(Constants.WindowIdentifier.Modal, {
                          target: '/postgame',
                          payload: spotlight.id,
                        })
                      }
                    >
                      {t('shared.viewMatchDetails')}
                    </button>
                  </aside>
                  {debugEnabled && spotlightIsUserUpcoming && (
                    <aside className="stack-x items-center gap-2 px-2 py-2">
                      <span className="text-xs uppercase tracking-wide opacity-70">Developer Debug</span>
                      <input
                        type="time"
                        className="input input-sm max-w-40"
                        value={debugTimeValue}
                        onChange={(event) => setDebugTimeValue(event.target.value)}
                      />
                      <button type="button" className="btn btn-sm" onClick={() => void applyReschedule()}>
                        Apply start time
                      </button>
                    </aside>
                  )}
                  <aside className="stack-y px-2 pb-2">
                    <h4 className="text-sm font-semibold">All fixtures on this date</h4>
                    {matchesOnSelectedDay.map((fixture) => {
                      const mode = getCompetitionMode(fixture);
                      return (
                        <div key={`fixture-${fixture.id}`} className="flex items-center justify-between gap-2 rounded border border-base-content/10 px-2 py-1">
                          <div>
                            <div className="text-sm">{fixture.competitors.map((c) => c.team?.name || 'TBD').join(' vs ')}</div>
                            <div className="text-xs opacity-70">{format(fixture.date, 'p')} · {Util.getCompetitionTierName(fixture.competition.tier)} · {mode.mode}</div>
                          </div>
                          {fixture.status !== Constants.MatchStatus.COMPLETED && isSameDay(fixture.date, today) && (
                            <button className="btn btn-xs" onClick={() => dispatch(play(fixture.id, true))}>
                              Spectate
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </aside>
                </footer>
              </article>
            );
          })()}
        </section>
        <section>
          <table className="table-pin-rows table-xs table-zebra table h-full table-fixed">
            <thead>
              <tr>
                {weekdays.map((day) => (
                  <th key={day.toString()}>
                    <p className="uppercase">{format(day, 'EEE')}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {calendar.map((week, weekIdx) => (
                <tr key={weekIdx}>
                  {week.map((day: Date | null, dayIdx) => (
                    <td
                      key={day?.toString() || dayIdx + '__empty_day'}
                      className={cx(
                        'border-base-content/10 h-24 border align-top',
                        !!day && isSameDay(day, today) && 'bg-primary/10',
                        !!spotlight &&
                          !!day && isSameDay(day, spotlight.date) &&
                          'bg-base-300',
                      )}
                    >
                      {(() => {
                        if (!day) {
                          return <p />;
                        }

                        const matchday = matches.find((match) => isSameDay(match.date, day));
                        const worldCount = worldMatches.filter((match) => isSameDay(match.date, day)).length;

                        if (!matchday) {
                          return (
                            <div
                              className={cx('relative h-full w-full cursor-pointer')}
                              onClick={() => {
                                setCurrent(day);
                                setSpotlight(undefined);
                              }}
                            >
                              <h2>{day.getDate()}</h2>
                              {worldCount > 0 && <span className="badge badge-xs">{worldCount} matches</span>}
                            </div>
                          );
                        }

                        const opponent = matchday.competitors.find(
                          (competitor) => competitor.teamId !== state.profile.teamId,
                        );

                        return (
                          <div
                            className={cx('relative h-full w-full cursor-pointer')}
                            onClick={() => {
                              setCurrent(day);
                              setSpotlight(matchday);
                            }}
                          >
                            <h2>{day.getDate()}</h2>
                            {worldCount > 0 && <span className="badge badge-xs">{worldCount} matches</span>}
                            <p>{Util.getCompetitionTierName(matchday.competition.tier)}</p>
                            {!opponent && <p>BYE</p>}
                            {matchday.status === Constants.MatchStatus.COMPLETED && !!opponent && (
                              <span
                                className={cx(
                                  'badge badge-xs',
                                  ['badge-error', 'badge-ghost', 'badge-success'][opponent.result],
                                )}
                              >
                                {matchday.competitors
                                  .map((competitor) => competitor.score)
                                  .join('-')}
                              </span>
                            )}
                            {!!opponent && (
                              <img
                                title={opponent.team.name}
                                className="absolute right-0 bottom-0 size-12"
                                src={opponent.team.blazon}
                              />
                            )}
                          </div>
                        );
                      })()}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
