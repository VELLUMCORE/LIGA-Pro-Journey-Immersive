/**
 * Dedicated modal for transfer offers (Player Career Only).
 *
 * This modal now ONLY supports:
 * - Viewing incoming PLAYER_PENDING offers for the user.
 * - Accepting or rejecting those offers.
 * - Viewing past offers.
 *
 * All Manager Career logic has been removed.
 */

import React from 'react';
import { flatten } from 'lodash';
import { useLocation } from 'react-router-dom';
import { Bot, Constants, Eagers, Util } from '@liga/shared';
import { cx } from '@liga/frontend/lib';
import { AppStateContext } from '@liga/frontend/redux';
import { Image } from '@liga/frontend/components';
import { XPBar } from '@liga/frontend/components/player-card';
import { FaBan, FaCheck } from 'react-icons/fa';

/** @enum */
enum Tab {
  REVIEW_OFFERS,
  PAST_OFFERS,
}

/** @type {Player} */
type Player = (NonNullable<Awaited<ReturnType<typeof api.players.find<typeof Eagers.player>>>> & {
  careerStints?: Array<{ teamId: number | null; startedAt: Date; endedAt: Date | null }>;
}) | null;

/** @type {Transfer} */
type Transfer = Awaited<ReturnType<typeof api.transfers.all<typeof Eagers.transfer>>>[number];


const TransferStatusBadgeColor: Record<number, string> = {
  [Constants.TransferStatus.PLAYER_ACCEPTED]: 'badge-success',
  [Constants.TransferStatus.PLAYER_PENDING]: 'badge-warning',
  [Constants.TransferStatus.PLAYER_REJECTED]: 'badge-error',
  [Constants.TransferStatus.TEAM_ACCEPTED]: 'badge-success',
  [Constants.TransferStatus.TEAM_PENDING]: 'badge-warning',
  [Constants.TransferStatus.TEAM_REJECTED]: 'badge-error',
};

function fetchTransfers(playerId: number) {
  return api.transfers.all({
    where: { target: { id: playerId } },
    include: Eagers.transfer.include,
  });
}

export default function TransferModal() {
  const location = useLocation();
  const { state } = React.useContext(AppStateContext);

  const [activeTab, setActiveTab] = React.useState<Tab>(Tab.PAST_OFFERS);
  const [player, setPlayer] = React.useState<Player>();
  const [transfers, setTransfers] = React.useState<Array<Transfer>>([]);

  const isUserPlayer = player?.id === state.profile.playerId;

  React.useEffect(() => {
    if (!location.state) return;

    const playerId = location.state as number;

    api.players
      .find({
        include: {
          ...Eagers.player.include,
          careerStints: true,
        },
        where: { id: playerId },
      })
      .then((foundPlayer) => setPlayer(foundPlayer ?? undefined));

    fetchTransfers(playerId).then(setTransfers);
  }, []);

  React.useEffect(() => {
    if (!player) return;
    setActiveTab(isUserPlayer ? Tab.REVIEW_OFFERS : Tab.PAST_OFFERS);
  }, [player, isUserPlayer]);

  const offers = React.useMemo(() => {
    if (!transfers) return [];
    return flatten(transfers.map((t) => t.offers));
  }, [transfers]);

  const pendingTransfers = React.useMemo(() => {
    if (!isUserPlayer) return [];
    return (transfers ?? []).filter(
      (t) => t.status === Constants.TransferStatus.PLAYER_PENDING,
    );
  }, [transfers, isUserPlayer]);

  const [majorWinCount, setMajorWinCount] = React.useState(0);
  const [honors, setHonors] = React.useState<
    Record<string, { count: number; seasons: number[]; tierSlug: string; federationSlug: string }>
  >({});

  React.useEffect(() => {
    if (!player) return;

    const championAwards = [
      ...Constants.Awards.filter((award) => award.type === Constants.AwardType.CHAMPION).map(
        (award) => award.target,
      ),
      Constants.TierSlug.MAJOR_CHAMPIONS_STAGE,
    ];

    api.competitions
      .all<{
        include: {
          competitors: true;
          federation: true;
          tier: {
            include: {
              league: true;
            };
          };
          matches: {
            include: {
              competitors: true;
              players: {
                select: { id: true };
              };
            };
          };
        };
      }>({
        where: {
          status: Constants.CompetitionStatus.COMPLETED,
          tier: {
            slug: { in: championAwards },
          },
        },
        include: {
          competitors: true,
          federation: true,
          tier: {
            include: {
              league: true,
            },
          },
          matches: {
            include: {
              competitors: true,
              players: {
                select: { id: true },
              },
            },
          },
        },
        orderBy: { season: 'desc' },
      })
      .then((competitions) => {
        const stints = player.careerStints ?? [];

        const awarded = competitions.filter((competition) => {
          const championshipMatch = competition.matches.reduce<(typeof competition.matches)[number] | null>(
            (latest, match) => {
              if (!latest || match.date > latest.date) return match;
              return latest;
            },
            null,
          );

          if (!championshipMatch) return false;

          let winnerTeamId = competition.competitors.find((c) => c.position === 1)?.teamId;
          if (!winnerTeamId && championshipMatch.competitors.length >= 2) {
            const ordered = [...championshipMatch.competitors].sort(
              (a, b) => (b.score ?? 0) - (a.score ?? 0),
            );
            winnerTeamId = ordered[0]?.teamId;
          }
          if (!winnerTeamId) return false;

          const championshipDate = new Date(championshipMatch.date);
          const wasOnWinnerViaStint = stints.some((stint) => {
            if (stint.teamId !== winnerTeamId) return false;

            const startedAt = new Date(stint.startedAt);
            startedAt.setHours(0, 0, 0, 0);

            const endedAt = stint.endedAt ? new Date(stint.endedAt) : null;
            if (endedAt) endedAt.setHours(23, 59, 59, 999);

            return startedAt <= championshipDate && (!endedAt || endedAt >= championshipDate);
          });

          const everOnWinnerTeam = stints.some((stint) => stint.teamId === winnerTeamId);
          const appearedInCompetition = competition.matches.some((match) =>
            match.players.some((p) => p.id === player.id),
          );

          return (
            wasOnWinnerViaStint ||
            everOnWinnerTeam ||
            (stints.length === 0 && (appearedInCompetition || player.teamId === winnerTeamId))
          );
        });

        setMajorWinCount(
          awarded.filter((c) => c.tier.slug === Constants.TierSlug.MAJOR_CHAMPIONS_STAGE).length,
        );

        const grouped = awarded.reduce<
          Record<string, { count: number; seasons: number[]; tierSlug: string; federationSlug: string }>
        >((acc, competition) => {
          const key = `${competition.tier.slug}__${competition.federation.slug}`;
          if (!acc[key]) {
            acc[key] = {
              count: 0,
              seasons: [],
              tierSlug: competition.tier.slug,
              federationSlug: competition.federation.slug,
            };
          }

          acc[key].count += 1;
          acc[key].seasons.push(competition.season);
          return acc;
        }, {});

        setHonors(grouped);
      });
  }, [player]);

  if (!player) {
    return (
      <main className="h-screen w-screen">
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      </main>
    );
  }

  return (
    <main className="divide-base-content/10 flex h-screen w-screen flex-col divide-y">
      {/* PLAYER CARD */}
      <section className="flex">
        <figure className="border-base-content/10 flex h-[246px] w-1/5 items-end justify-center overflow-hidden border-b p-0">
          <Image
            src={player.avatar || 'resources://avatars/empty.png'}
            className="mt-auto h-[390px] w-auto max-w-none object-contain"
          />
        </figure>

        <table className="table table-fixed">
          <thead>
            <tr>
              <th>Name</th>
              <th>Country</th>
              <th>Team</th>
              <th>Age</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-base-content/10 border-l">
              <td className="truncate">{player.name}</td>
              <td>
                <span className={cx('fp', 'mr-2', player.country.code.toLowerCase())} />
                {player.country.name}
              </td>
              <td className="truncate">
                {player.team ? (
                  <>
                    <img src={player.team.blazon} className="inline-block size-6" />
                    <span>&nbsp;{player.team.name}</span>
                  </>
                ) : (
                  'Free Agent'
                )}
              </td>
              <td>{player.age ? `${player.age} years` : 'N/A'}</td>
            </tr>
          </tbody>

          <thead>
            <tr>
              <th colSpan={3}>Stats</th>
              <th className="text-right">
                {majorWinCount > 0 && (
                  <span className="badge border-yellow-300 bg-yellow-500/20 px-4 py-3 font-semibold text-yellow-200">
                    {majorWinCount}x Major winner
                  </span>
                )}
              </th>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td colSpan={4} className="px-4 py-2">
                <XPBar
                  className="w-full"
                  title="Total XP"
                  value={Bot.Exp.getTotalXP(player.xp)}
                  max={100}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </section>


      <section className="border-base-content/10 flex min-h-12 items-center gap-4 border-t px-4 py-2">
        {Object.keys(honors).length === 0 && <span className="text-sm opacity-60">No honors yet.</span>}
        {Object.values(honors).map((honor) => {
          const seasonsList = [...honor.seasons]
            .sort((a, b) => a - b)
            .map((season) => `Season ${season}`)
            .join(', ');

          return (
            <div key={`${honor.tierSlug}__${honor.federationSlug}`} className="tooltip flex items-center gap-2" data-tip={seasonsList}>
              <Image
                alt={honor.tierSlug}
                className="h-12 w-12 object-contain"
                src={Util.getCompetitionLogo(honor.tierSlug, honor.federationSlug)}
              />
              <span className="text-base font-bold">x{honor.count}</span>
            </div>
          );
        })}
      </section>

      {/* TAB BAR (Player Career Only: REVIEW_OFFERS + PAST_OFFERS) */}
      <section role="tablist" className="tabs-box tabs rounded-none border-t-0!">
        {Object.keys(Tab)
          .filter((k) => isNaN(Number(k)))
          .filter((tabKey: keyof typeof Tab) => {
            const tab = Tab[tabKey];
            if (isUserPlayer) {
              return tab === Tab.REVIEW_OFFERS || tab === Tab.PAST_OFFERS;
            }
            return tab === Tab.PAST_OFFERS;
          })
          .map((tabKey: keyof typeof Tab) => (
            <a
              key={tabKey}
              role="tab"
              className={cx('tab capitalize', Tab[tabKey] === activeTab && 'tab-active')}
              onClick={() => setActiveTab(Tab[tabKey])}
            >
              {tabKey.replace('_', ' ').toLowerCase()}
            </a>
          ))}
      </section>

      {/* REVIEW OFFERS (Only PLAYER_PENDING for YOU) */}
      {activeTab === Tab.REVIEW_OFFERS && isUserPlayer && (
        <section className="flex-1 overflow-y-scroll">
          <table className="table table-fixed table-pin-rows">
            <thead>
              <tr>
                <th>From</th>
                <th className="text-center">Fee</th>
                <th className="text-right">Accept / Reject</th>
              </tr>
            </thead>

            <tbody>
              {pendingTransfers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-8 text-center opacity-60">
                    No pending offers.
                  </td>
                </tr>
              )}

              {pendingTransfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="truncate">
                    <img src={transfer.from.blazon} className="inline-block size-6" />
                    <span>&nbsp;{transfer.from.name}</span>
                  </td>

                  <td className="text-center">
                    {Util.formatCurrency(transfer.offers[0].cost)}
                  </td>

                  <td className="join w-full justify-end text-center">
                    <button
                      title="Accept Offer"
                      className="btn btn-success join-item btn-sm"
                      onClick={() =>
                        api.transfers
                          .accept(transfer.id)
                          .then(() => fetchTransfers(player.id))
                          .then(setTransfers)
                      }
                    >
                      <FaCheck />
                    </button>

                    <button
                      title="Reject Offer"
                      className="btn btn-error join-item btn-sm"
                      onClick={() =>
                        api.transfers
                          .reject(transfer.id)
                          .then(() => fetchTransfers(player.id))
                          .then(setTransfers)
                      }
                    >
                      <FaBan />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* PAST OFFERS */}
      {activeTab === Tab.PAST_OFFERS && (
        <section className="flex-1 overflow-y-scroll">
          <table className="table table-fixed table-pin-rows">
            <thead>
              <tr>
                <th>From</th>
                <th className="text-center">Fee</th>
                <th className="text-center">Wages</th>
                <th className="w-3/12 text-center">Status</th>
              </tr>
            </thead>

            <tbody>
              {offers.map((offer) => {
                const transfer = transfers.find((t) => t.id === offer.transferId);
                const team = transfer?.from;

                if (!team) return null;

                return (
                  <tr key={offer.id}>
                    <td>
                      <img src={team.blazon} className="inline-block size-6" />
                      <span>&nbsp;{team.name}</span>
                    </td>

                    <td className="text-center">
                      {Util.formatCurrency(offer.cost)}
                    </td>

                    <td className="text-center">
                      {Util.formatCurrency(offer.wages)}
                    </td>

                    <td className="text-center">
                      <span
                        className={cx(
                          'badge w-full capitalize',
                          TransferStatusBadgeColor[offer.status],
                        )}
                      >
                        {Constants.IdiomaticTransferStatus[offer.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
