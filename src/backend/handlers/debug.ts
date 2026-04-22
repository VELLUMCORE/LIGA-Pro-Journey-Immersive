/**
 * Developer-only debug IPC overrides.
 *
 * These handlers intentionally replace the earlier route registrations so
 * the debug UI can use stable, immediate flows in dev builds.
 *
 * @module
 */
import * as Sqrl from 'squirrelly';
import { ipcMain } from 'electron';
import { sample } from 'lodash';
import { Constants, Eagers, Util, is } from '@liga/shared';
import { DatabaseClient, Worldgen, getLocale, WindowManager } from '@liga/backend/lib';
import { FaceitMatchmaker } from '@liga/backend/lib/matchmaker';

type MatchPlayer = {
  id: number;
  name: string;
  elo: number;
  level: number;
  role: string | null;
  personality: string | null;
  userControlled: boolean;
  countryId: number;
  teamId: number | null;
  queueId?: string;
  queueType?: 'COUNTRY' | 'TEAM' | 'BOTH';
};

type MatchRoom = {
  matchId: string;
  teamA: MatchPlayer[];
  teamB: MatchPlayer[];
  expectedWinA: number;
  expectedWinB: number;
  eloGain: number;
  eloLoss: number;
  selectedMap?: string;
};

type DebugOutcome = 'W' | 'D' | 'L';
type DebugStyle = 'DEFAULT' | 'MVP' | 'BOTTOM';

async function ensureDeveloperDebugProfile() {
  if (!is.dev()) {
    throw new Error('DEBUG_DEV_ONLY');
  }

  const profile = await DatabaseClient.prisma.profile.findFirst({
    include: {
      player: true,
    },
  });

  if (!profile?.playerId || !profile.player) {
    throw new Error('PROFILE_NOT_FOUND');
  }

  const settings = Util.loadSettings(profile.settings);
  if (!(settings.general as any).debug) {
    throw new Error('DEBUG_MODE_DISABLED');
  }

  return profile;
}

function reorderRoomForUser(room: MatchRoom, playerId: number) {
  const userInTeamA = room.teamA.some((player) => player.id === playerId);
  const userTeam = userInTeamA ? [...room.teamA] : [...room.teamB];
  const opponentTeam = userInTeamA ? [...room.teamB] : [...room.teamA];
  const userIndex = userTeam.findIndex((player) => player.id === playerId);

  if (userIndex > 0) {
    const [user] = userTeam.splice(userIndex, 1);
    userTeam.unshift(user);
  }

  return {
    ...room,
    teamA: userTeam,
    teamB: opponentTeam,
  };
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(values: T[]) {
  const copy = [...values];

  for (let idx = copy.length - 1; idx > 0; idx -= 1) {
    const swapIdx = Math.floor(Math.random() * (idx + 1));
    [copy[idx], copy[swapIdx]] = [copy[swapIdx], copy[idx]];
  }

  return copy;
}

function allocateKills(
  players: MatchPlayer[],
  userId: number,
  outcome: DebugOutcome,
  style: DebugStyle,
  isUserTeam: boolean,
) {
  const total =
    outcome === 'D'
      ? rand(90, 115)
      : isUserTeam
        ? outcome === 'W'
          ? rand(95, 120)
          : rand(70, 95)
        : outcome === 'W'
          ? rand(70, 95)
          : rand(95, 120);

  let userKills = rand(16, 24);
  if (style === 'MVP' && outcome === 'W' && isUserTeam) {
    userKills = rand(28, 36);
  }
  if (style === 'BOTTOM' && outcome === 'L' && isUserTeam) {
    userKills = rand(4, 10);
  }

  const others = shuffleArray(players.filter((player) => player.id !== userId));
  const result = new Map<number, number>();
  result.set(userId, userKills);

  let remaining = Math.max(0, total - userKills);
  const maxPerPlayer = style === 'MVP' && outcome === 'W' && isUserTeam ? userKills - 3 : 30;

  others.forEach((player, index) => {
    if (index === others.length - 1) {
      result.set(player.id, remaining);
      return;
    }

    const minLeft = Math.max(0, (others.length - index - 1) * 8);
    const maxAllowed = Math.max(8, Math.min(maxPerPlayer, remaining - minLeft));
    const assigned = rand(8, maxAllowed);
    result.set(player.id, assigned);
    remaining -= assigned;
  });

  return result;
}

function buildVictimPicker(players: MatchPlayer[], userId: number, userWeight: number) {
  const weights = new Map<number, number>();

  players.forEach((player) => {
    weights.set(player.id, player.id === userId ? userWeight : 1);
  });

  return () => {
    const expanded = Array.from(weights.entries()).flatMap(([id, weight]) =>
      Array(Math.max(1, weight)).fill(id),
    );
    return expanded[rand(0, expanded.length - 1)];
  };
}

function createSyntheticEvents(
  room: MatchRoom,
  userId: number,
  outcome: DebugOutcome,
  style: DebugStyle,
  gameId: number,
  matchId: number,
) {
  const yourTeam = room.teamA;
  const oppTeam = room.teamB;
  const yourKills = allocateKills(yourTeam, userId, outcome, style, true);
  const oppKills = allocateKills(oppTeam, userId, outcome, style, false);
  const pickYourVictim = buildVictimPicker(oppTeam, -1, 1);
  const userDeathWeight =
    style === 'BOTTOM' && outcome === 'L' ? 4 : style === 'MVP' && outcome === 'W' ? 1 : 2;
  const pickOppVictim = buildVictimPicker(yourTeam, userId, userDeathWeight);
  const events: Array<Record<string, unknown>> = [];
  let timestamp = Date.now();

  const pushKillEvent = (attacker: MatchPlayer, victim: MatchPlayer, teammates: MatchPlayer[]) => {
    const maybeAssist =
      teammates
        .filter((player) => player.id !== attacker.id)
        .filter(() => Math.random() < 0.35)[0] || null;

    const payload = {
      type: 'playerkilled',
      payload: {
        timestamp: new Date(timestamp),
        attacker: { name: attacker.name },
        victim: { name: victim.name },
        weapon: 'ak47',
        headshot: Math.random() < 0.45,
      },
    };

    events.push({
      half: 0,
      headshot: Boolean(payload.payload.headshot),
      payload: JSON.stringify(payload),
      timestamp: new Date(timestamp),
      weapon: 'ak47',
      attackerId: attacker.id,
      victimId: victim.id,
      assistId: maybeAssist?.id ?? null,
      gameId,
      matchId,
    });

    if (maybeAssist) {
      const assistPayload = {
        type: 'playerassisted',
        payload: {
          timestamp: new Date(timestamp + 50),
          assist: { name: maybeAssist.name },
          victim: { name: victim.name },
        },
      };

      events.push({
        half: 0,
        headshot: false,
        payload: JSON.stringify(assistPayload),
        timestamp: new Date(timestamp + 50),
        attackerId: null,
        victimId: victim.id,
        assistId: maybeAssist.id,
        gameId,
        matchId,
      });
    }

    timestamp += rand(800, 2200);
  };

  yourTeam.forEach((player) => {
    const kills = yourKills.get(player.id) ?? 0;
    for (let idx = 0; idx < kills; idx += 1) {
      const victimId = pickYourVictim();
      const victim =
        oppTeam.find((entry) => entry.id === victimId) || oppTeam[rand(0, oppTeam.length - 1)];
      pushKillEvent(player, victim, yourTeam);
    }
  });

  oppTeam.forEach((player) => {
    const kills = oppKills.get(player.id) ?? 0;
    for (let idx = 0; idx < kills; idx += 1) {
      const victimId = pickOppVictim();
      const victim =
        yourTeam.find((entry) => entry.id === victimId) || yourTeam[rand(0, yourTeam.length - 1)];
      pushKillEvent(player, victim, oppTeam);
    }
  });

  return events;
}

export default function registerDebugOverrides() {
  ipcMain.removeHandler('/debug/team-offer');
  ipcMain.removeHandler('/debug/faceit-result');

  ipcMain.handle('/debug/team-offer', async (_, teamId: number) => {
    await DatabaseClient.connect();
    const profile = await ensureDeveloperDebugProfile();

    const team = await DatabaseClient.prisma.team.findFirst({
      where: {
        id: Number(teamId),
      },
    });

    if (!team || team.id === profile.teamId) {
      throw new Error('TEAM_NOT_FOUND');
    }

    const existingTransfer = await DatabaseClient.prisma.transfer.findFirst({
      where: {
        playerId: profile.playerId,
        teamIdFrom: team.id,
        status: Constants.TransferStatus.PLAYER_PENDING,
        offers: {
          some: {
            status: Constants.TransferStatus.PLAYER_PENDING,
          },
        },
      },
      include: Eagers.transfer.include,
    });

    const expiresAt = new Date(profile.date);
    expiresAt.setDate(expiresAt.getDate() + 7);

    const transfer =
      existingTransfer ||
      (await DatabaseClient.prisma.transfer.create({
        data: {
          status: Constants.TransferStatus.PLAYER_PENDING,
          from: {
            connect: {
              id: team.id,
            },
          },
          target: {
            connect: {
              id: profile.playerId,
            },
          },
          offers: {
            create: {
              status: Constants.TransferStatus.PLAYER_PENDING,
              cost: Math.max(profile.player?.cost ?? 0, 0),
              wages: Math.max(profile.player?.wages ?? 1000, 1000),
              contractYears: 1,
              expiresAt,
            },
          },
        },
        include: Eagers.transfer.include,
      }));

    const persona =
      transfer.from?.personas.find(
        (entry) =>
          entry.role === Constants.PersonaRole.MANAGER ||
          entry.role === Constants.PersonaRole.ASSISTANT,
      ) ?? transfer.from?.personas[0];

    if (persona) {
      const locale = getLocale(profile);
      await Worldgen.sendEmail(
        Sqrl.render(locale.templates.OfferIncoming.SUBJECT, { transfer, profile }),
        Sqrl.render(locale.templates.OfferIncoming.CONTENT, { transfer, profile }),
        persona,
        profile.date,
        true,
      );
    }

    WindowManager.sendAll(Constants.IPCRoute.TRANSFER_UPDATE);
    return transfer;
  });

  ipcMain.handle(
    '/debug/faceit-result',
    async (_, payload: { outcome: DebugOutcome; style?: DebugStyle }) => {
      const prisma = await DatabaseClient.connect();
      const profile = await ensureDeveloperDebugProfile();

      const outcome = payload?.outcome || 'W';
      const style = payload?.style || 'DEFAULT';
      const roomBase = await FaceitMatchmaker.createMatchRoom(prisma, {
        id: profile.player.id,
        name: profile.player.name,
        elo: profile.faceitElo,
        queueElo: profile.faceitElo,
        maxPartyEloDelta: 0,
      });
      const room = reorderRoomForUser(roomBase as MatchRoom, profile.playerId);

      const mapPool = await prisma.mapPool.findMany({
        where: {
          gameVersion: {
            slug: Constants.Game.CSGO,
          },
        },
        include: Eagers.mapPool.include,
      });
      const selectedMap = sample(mapPool)?.gameMap.name || 'de_inferno';

      const userScore = outcome === 'W' ? 13 : outcome === 'D' ? 15 : rand(4, 11);
      const oppScore = outcome === 'W' ? rand(4, 11) : outcome === 'D' ? 15 : 13;
      const delta = outcome === 'W' ? 25 : outcome === 'D' ? 0 : -25;
      const nextElo = Math.max(100, Math.min(5000, Number(profile.faceitElo || 1200) + delta));

      return prisma.$transaction(async (tx) => {
        const createdMatch = await tx.match.create({
          data: {
            matchType: 'FACEIT_PUG',
            date: profile.date,
            payload: JSON.stringify({ ...room, selectedMap }),
            profileId: profile.id,
            status: Constants.MatchStatus.COMPLETED,
            totalRounds: userScore + oppScore,
            faceitEloDelta: delta,
            faceitRating: nextElo,
            faceitIsWin: outcome === 'D' ? null : outcome === 'W',
            faceitTeammates: JSON.stringify(room.teamA),
            faceitOpponents: JSON.stringify(room.teamB),
            players: {
              connect: [...room.teamA, ...room.teamB].map((player) => ({ id: player.id })),
            },
            competitors: {
              create: [
                {
                  teamId: 1,
                  seed: 0,
                  score: userScore,
                  result:
                    outcome === 'W'
                      ? Constants.MatchResult.WIN
                      : outcome === 'D'
                        ? Constants.MatchResult.DRAW
                        : Constants.MatchResult.LOSS,
                },
                {
                  teamId: 2,
                  seed: 1,
                  score: oppScore,
                  result:
                    outcome === 'L'
                      ? Constants.MatchResult.WIN
                      : outcome === 'D'
                        ? Constants.MatchResult.DRAW
                        : Constants.MatchResult.LOSS,
                },
              ],
            },
            games: {
              create: [
                {
                  num: 1,
                  map: selectedMap,
                  status: Constants.MatchStatus.COMPLETED,
                  teams: {
                    create: [
                      {
                        teamId: 1,
                        seed: 0,
                        score: userScore,
                        result:
                          outcome === 'W'
                            ? Constants.MatchResult.WIN
                            : outcome === 'D'
                              ? Constants.MatchResult.DRAW
                              : Constants.MatchResult.LOSS,
                      },
                      {
                        teamId: 2,
                        seed: 1,
                        score: oppScore,
                        result:
                          outcome === 'L'
                            ? Constants.MatchResult.WIN
                            : outcome === 'D'
                              ? Constants.MatchResult.DRAW
                              : Constants.MatchResult.LOSS,
                      },
                    ],
                  },
                },
              ],
            },
          },
          include: {
            games: true,
          },
        });

        const events = createSyntheticEvents(
          room,
          profile.playerId,
          outcome,
          style,
          createdMatch.games[0].id,
          createdMatch.id,
        );

        for (const event of events) {
          await tx.matchEvent.create({
            data: event as any,
          });
        }

        await tx.player.update({
          where: {
            id: profile.playerId,
          },
          data: {
            elo: {
              increment: delta,
            },
            xp: {
              increment: outcome === 'W' ? 50 : outcome === 'D' ? 25 : 10,
            },
          },
        });

        return tx.profile.update({
          where: {
            id: profile.id,
          },
          data: {
            faceitElo: nextElo,
          },
          include: {
            player: true,
          },
        });
      });
    },
  );
}
