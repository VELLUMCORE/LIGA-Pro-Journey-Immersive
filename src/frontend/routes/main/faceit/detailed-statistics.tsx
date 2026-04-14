import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import faceitLogo from "../../../assets/faceit/faceit.png";
import killsIcon from "../../../assets/faceit/kills.png";
import deathsIcon from "../../../assets/faceit/deaths.png";
import headshotIcon from "../../../assets/faceit/headshot.png";
import { AppStateContext } from "@liga/frontend/redux";
import { Constants, Util } from "@liga/shared";

type DetailedStatisticsRouteState = {
  fromFaceitDetailedStatisticsButton?: boolean;
};

type FaceitMapConfig = {
  key: string;
  label: string;
  mapSlug: string;
  customIconName: string;
};

type AggregatedStats = {
  kills: number;
  deaths: number;
  hsPercent: number;
  kdRatio: number;
  highestKills: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
};

type EloPoint = {
  matchId: number;
  date: string | Date;
  elo: number;
  eloDelta: number;
  map: string;
};

const ELO_WINDOW_SIZE = 30;

const FACEIT_MAPS: FaceitMapConfig[] = [
  { key: "ancient", label: "Ancient", mapSlug: "de_ancient", customIconName: "ancient" },
  { key: "anubis", label: "Anubis", mapSlug: "de_anubis", customIconName: "anubis" },
  { key: "cache", label: "Cache", mapSlug: "de_cache", customIconName: "cache" },
  { key: "dust2", label: "Dust II", mapSlug: "de_dust2", customIconName: "dust2" },
  { key: "inferno", label: "Inferno", mapSlug: "de_inferno", customIconName: "inferno" },
  { key: "mirage", label: "Mirage", mapSlug: "de_mirage", customIconName: "mirage" },
  { key: "nuke", label: "Nuke", mapSlug: "de_nuke", customIconName: "nuke" },
  { key: "overpass", label: "Overpass", mapSlug: "de_overpass", customIconName: "overpass" },
  { key: "train", label: "Train", mapSlug: "de_train", customIconName: "train" },
  { key: "vertigo", label: "Vertigo", mapSlug: "de_vertigo", customIconName: "vertigo" },
];

const customMapIconsContext = (require as any).context("../../../assets/faceit", false, /\.\/.+\.png$/);

const getCustomMapIcon = (name: string): string | null => {
  const path = `./${name.toLowerCase()}.png`;
  if (!customMapIconsContext.keys().includes(path)) return null;
  const loaded = customMapIconsContext(path);
  return typeof loaded === "string" ? loaded : loaded?.default || null;
};

export default function FaceitDetailedStatistics(): JSX.Element {
  const { state } = React.useContext(AppStateContext);
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state || {}) as DetailedStatisticsRouteState;

  const [loading, setLoading] = React.useState(true);
  const [selectedMapKey, setSelectedMapKey] = React.useState<string | null>(null);
  const [allTimeStats, setAllTimeStats] = React.useState<AggregatedStats | null>(null);
  const [mapStats, setMapStats] = React.useState<Record<string, AggregatedStats>>({});
  const [eloHistory, setEloHistory] = React.useState<EloPoint[]>([]);
  const [eloWindowStart, setEloWindowStart] = React.useState(0);
  const [hoveredEloIndex, setHoveredEloIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!routeState.fromFaceitDetailedStatisticsButton) {
      navigate("/faceit", { replace: true });
    }
  }, [navigate, routeState.fromFaceitDetailedStatisticsButton]);

  const settingsAll = React.useMemo(() => {
    if (!state.profile) return Constants.Settings;
    return Util.loadSettings(state.profile.settings);
  }, [state.profile]);

  const gameEnum = settingsAll.general.game as Constants.Game;

  React.useEffect(() => {
    (async () => {
      try {
        const detailedStats = await api.faceit.detailedStats();
        setAllTimeStats(
          detailedStats.allTime
            ? {
              ...detailedStats.allTime,
              hsPercent: Math.round(Number(detailedStats.allTime.hsPercent || 0)),
              winRate: Math.round(Number(detailedStats.allTime.winRate || 0)),
            }
            : null
        );

        const computedMapStats: Record<string, AggregatedStats> = {};
        for (const map of FACEIT_MAPS) {
          const stats = detailedStats.byMap?.[map.mapSlug];
          computedMapStats[map.key] = {
            kills: Number(stats?.kills || 0),
            deaths: Number(stats?.deaths || 0),
            hsPercent: Math.round(Number(stats?.hsPercent || 0)),
            kdRatio: Number(stats?.kdRatio || 0),
            highestKills: Number(stats?.highestKills || 0),
            matchesPlayed: Number(stats?.matchesPlayed || 0),
            wins: Number(stats?.wins || 0),
            losses: Number(stats?.losses || 0),
            winRate: Math.round(Number(stats?.winRate || 0)),
          };
        }

        setMapStats(computedMapStats);
        const fullEloHistory = detailedStats.eloHistory || [];
        setEloHistory(fullEloHistory);
        setEloWindowStart(Math.max(0, fullEloHistory.length - ELO_WINDOW_SIZE));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    setHoveredEloIndex(null);
  }, [eloWindowStart]);

  const selectedMap = FACEIT_MAPS.find((map) => map.key === selectedMapKey) || null;
  const activeStats = selectedMap ? mapStats[selectedMap.key] : allTimeStats;
  const rightCardImage = selectedMap
    ? Util.convertMapPool(selectedMap.mapSlug, gameEnum, true)
    : getCustomMapIcon("allmaps");
  const avgKills =
    activeStats && activeStats.matchesPlayed > 0
      ? Math.floor(activeStats.kills / activeStats.matchesPlayed)
      : 0;
  const eloWindow = eloHistory.slice(eloWindowStart, eloWindowStart + ELO_WINDOW_SIZE);
  const canGoPrevElo = eloWindowStart > 0;
  const canGoNextElo = eloWindowStart + ELO_WINDOW_SIZE < eloHistory.length;

  const eloGraphData = React.useMemo(() => {
    const width = 1000;
    const height = 220;
    const padding = 18;
    const elos = eloWindow.map((point) => point.elo);
    const min = elos.length > 0 ? Math.min(...elos) : 0;
    const max = elos.length > 0 ? Math.max(...elos) : 0;
    const range = Math.max(1, max - min);

    const points = eloWindow
      .map((point, index) => {
        const x = eloWindow.length <= 1
          ? width / 2
          : padding + (index / (eloWindow.length - 1)) * (width - padding * 2);
        const y = height - padding - ((point.elo - min) / range) * (height - padding * 2);
        return {
          ...point,
          x,
          y,
        };
      })
      ;

    return {
      width,
      height,
      min,
      max,
      mid: Math.round((min + max) / 2),
      points,
      polyline: points.map((point) => `${point.x},${point.y}`).join(" "),
    };
  }, [eloWindow]);

  const winRateColorClass = (winRate: number | undefined) => {
    if (winRate == null) return "text-white";
    if (winRate > 50) return "text-green-400";
    if (winRate < 50) return "text-red-400";
    return "text-white";
  };

  const renderStatCard = (
    title: string,
    value: string | number,
    icon?: string,
    valueClassName = "text-lg font-bold"
  ) => (
    <div className="bg-neutral-900/40 rounded-lg flex flex-col items-center justify-center p-3 h-28 border border-[#ffffff10]">
      {icon ? <img src={icon} className="w-10 h-10 mb-2 opacity-90" /> : null}
      <div className={valueClassName}>{value}</div>
      <div className="text-xs opacity-60 mt-1">{title}</div>
    </div>
  );

  return (
    <div className="w-full h-full bg-[#0b0b0b] text-white flex flex-col">
      <div className="w-full bg-[#0f0f0f] border-b border-[#ff7300]/60 py-4 shadow-lg flex items-center justify-between px-4">
        <button
          onClick={() => navigate("/faceit")}
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-semibold"
        >
          ← Back
        </button>

        <img src={faceitLogo} className="h-10 select-none" />

        <div className="w-16" />
      </div>

      <div className="p-6 h-[calc(100vh-96px)]">
        <div className="bg-[#0f0f0f] rounded-lg border border-[#ffffff15] h-full flex flex-col overflow-hidden">
          <div className="w-full bg-[#0c0c0c] py-3 px-4 border-b border-[#ff7300]/40">
            <h2 className="text-lg font-bold">DETAILED STATISTICS</h2>
          </div>

          <div className="flex-1 p-6 overflow-hidden">
            {loading ? (
              <div className="text-sm opacity-70">Loading detailed FACEIT stats…</div>
            ) : (
              <div className="grid h-full grid-cols-[220px_1fr_1fr] gap-4">
                <div className="bg-[#0b0b0b] border border-[#ffffff15] rounded-lg overflow-hidden flex flex-col">
                  <div className="px-4 py-3 border-b border-[#ffffff10] bg-[#0c0c0c]/70 text-lg font-semibold">
                    Map stats
                  </div>
                  <div className="p-3 space-y-2 overflow-y-auto">
                    <button
                      onClick={() => setSelectedMapKey(null)}
                      className={`w-full rounded border px-3 py-2 text-left text-sm font-semibold transition flex items-center gap-3 ${selectedMapKey === null
                          ? "bg-orange-600 border-orange-500 text-white"
                          : "bg-neutral-900/50 border-[#ffffff20] hover:border-[#ff7300]/70"
                        }`}
                    >
                      <img
                        src={getCustomMapIcon("allmaps") || Util.convertMapPool("de_mirage", gameEnum, true)}
                        className="w-8 h-8 rounded object-cover"
                      />
                      <span>All maps</span>
                    </button>

                    {FACEIT_MAPS.map((map) => {
                      const customIcon = getCustomMapIcon(map.customIconName);
                      const defaultIcon = Util.convertMapPool(map.mapSlug, gameEnum, true);
                      const iconSrc = customIcon || defaultIcon;

                      return (
                        <button
                          key={map.key}
                          onClick={() => setSelectedMapKey(map.key)}
                          className={`w-full rounded border px-3 py-2 text-left text-sm font-semibold transition flex items-center gap-3 ${selectedMapKey === map.key
                              ? "bg-orange-600 border-orange-500 text-white"
                              : "bg-neutral-900/50 border-[#ffffff20] hover:border-[#ff7300]/70"
                            }`}
                        >
                          <img src={iconSrc} className="w-8 h-8 rounded object-cover" />
                          <span>{map.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#0b0b0b] border border-[#ffffff15] rounded-lg p-4 flex flex-col min-h-0">
                  <h3 className="text-base font-bold mb-4">
                    {selectedMap ? `${selectedMap.label} Statistics` : "All Time Statistics"}
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
                    {renderStatCard("Kills", activeStats?.kills ?? "—", killsIcon)}
                    {renderStatCard("Deaths", activeStats?.deaths ?? "—", deathsIcon)}
                    {renderStatCard("HS%", `${activeStats?.hsPercent ?? 0}%`, headshotIcon)}
                    {renderStatCard("K/D", (activeStats?.kdRatio ?? 0).toFixed(2))}

                    {renderStatCard("Avg Kills", avgKills)}
                    {renderStatCard("Highest Kills", activeStats?.highestKills ?? "—")}
                  </div>

                  <div className="mt-4 border border-[#ffffff15] rounded-lg p-4 flex flex-col min-h-0 flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-bold">ELO</h3>
                      <div className="flex items-center gap-2">
                        <button
                          disabled={!canGoPrevElo}
                          onClick={() => setEloWindowStart((start) => Math.max(0, start - ELO_WINDOW_SIZE))}
                          className="px-2 py-1 text-xs rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Prev 30
                        </button>
                        <button
                          disabled={!canGoNextElo}
                          onClick={() =>
                            setEloWindowStart((start) =>
                              Math.min(
                                Math.max(0, eloHistory.length - ELO_WINDOW_SIZE),
                                start + ELO_WINDOW_SIZE
                              )
                            )
                          }
                          className="px-2 py-1 text-xs rounded bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next 30
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 bg-neutral-900/40 border border-[#ffffff10] rounded-lg p-3 min-h-[220px]">
                      {eloWindow.length < 2 ? (
                        <div className="h-full w-full flex items-center justify-center text-sm opacity-60">
                          Not enough matches to render ELO graph.
                        </div>
                      ) : (
                        <div className="h-full w-full flex gap-3">
                          <div className="w-12 flex flex-col justify-between text-xs text-neutral-300 py-2">
                            <span>{Math.round(eloGraphData.max)}</span>
                            <span>{eloGraphData.mid}</span>
                            <span>{Math.round(eloGraphData.min)}</span>
                          </div>

                          <div className="relative flex-1">
                            <svg
                              viewBox={`0 0 ${eloGraphData.width} ${eloGraphData.height}`}
                              className="w-full h-full"
                              preserveAspectRatio="none"
                            >
                              <polyline
                                fill="none"
                                stroke="#f97316"
                                strokeWidth="4"
                                points={eloGraphData.polyline}
                              />
                              {eloGraphData.points.map((point, index) => (
                                <circle
                                  key={point.matchId}
                                  cx={point.x}
                                  cy={point.y}
                                  r={index === hoveredEloIndex ? 7 : 5}
                                  fill={index === hoveredEloIndex ? "#fb923c" : "#f97316"}
                                  onMouseEnter={() => setHoveredEloIndex(index)}
                                  onMouseLeave={() => setHoveredEloIndex((current) => (current === index ? null : current))}
                                />
                              ))}
                            </svg>

                            {hoveredEloIndex != null ? (
                              <div className="absolute right-2 top-2 bg-[#0f0f0f] border border-[#ffffff20] rounded px-2 py-1 text-xs">
                                <div>ELO: {eloGraphData.points[hoveredEloIndex].elo}</div>
                                <div>
                                  Delta: {eloGraphData.points[hoveredEloIndex].eloDelta > 0 ? "+" : ""}
                                  {eloGraphData.points[hoveredEloIndex].eloDelta}
                                </div>
                                <div>Map: {Util.convertMapPool(eloGraphData.points[hoveredEloIndex].map, gameEnum)}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs opacity-60 text-right">
                      Showing matches {eloWindowStart + 1} - {Math.min(eloWindowStart + ELO_WINDOW_SIZE, eloHistory.length)} of {eloHistory.length}
                    </div>
                  </div>
                </div>

                <div className="bg-[#0b0b0b] border border-[#ffffff15] rounded-lg p-4 flex flex-col">
                  <h3 className="text-base font-bold mb-4">
                    {selectedMap ? `${selectedMap.label} Overview` : "All Maps Overview"}
                  </h3>

                  {rightCardImage ? (
                    <img
                      src={rightCardImage}
                      className="w-full h-56 object-cover rounded-lg border border-[#ffffff20]"
                    />
                  ) : (
                    <div className="w-full h-56 rounded-lg border border-dashed border-[#ffffff30] flex items-center justify-center text-sm opacity-60">
                      Add allmaps.png to src/frontend/assets/faceit
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      {renderStatCard("Matches", activeStats?.matchesPlayed ?? 0)}
                    </div>

                    {renderStatCard("W", activeStats?.wins ?? 0)}
                    {renderStatCard("L", activeStats?.losses ?? 0)}

                    <div className="col-span-2 flex justify-center">
                      <div className="w-full max-w-[calc(50%-8px)]">
                        {renderStatCard(
                          "Win Rate",
                          `${activeStats?.winRate ?? 0}%`,
                          undefined,
                          `text-lg font-bold ${winRateColorClass(activeStats?.winRate)}`
                        )}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
