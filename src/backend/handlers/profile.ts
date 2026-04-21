/**
 * Profile IPC handlers — PLAYER CAREER ONLY
 *
 * All manager-mode logic removed.
 */

import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { ipcMain } from "electron";
import { glob } from "glob";
import { Prisma } from "@prisma/client";
import { Constants, Util } from "@liga/shared";
import { DatabaseClient, Game, WindowManager, Worldgen } from "@liga/backend/lib";
import { syncRealtimeWorld } from "@liga/backend/lib/immersive-career";

export default function registerProfileHandlers() {
  ipcMain.handle(
    "profiles:createPlayerCareer",
    async (
      _,
      data: { playerName: string; countryId: number; role: string }
    ) => {
      const { playerName, countryId, role } = data;

      // Always use the single root profile
      const existing = await DatabaseClient.prisma.profile.findFirst();

      // 1. CREATE / UPDATE PROFILE
      const profile = await DatabaseClient.prisma.profile.update({
        where: { id: existing.id },
        data: {
          name: playerName,
          date: new Date().toISOString(),
          season: 0,
          faceitElo: 1200,

          player: {
            create: {
              name: playerName,
              countryId,
              role,
              xp: 0,
              prestige: 0,
              userControlled: true,
            },
          },
        },
        include: { player: true },
      });

      // Real-time career bootstrap: competitions are scheduled against a fixed season
      // anchor, then the world is immediately caught up to the player's actual clock.
      await Worldgen.onSeasonStart();
      const syncedProfile = await syncRealtimeWorld();

      return syncedProfile || profile;
    }
  );

  ipcMain.handle(Constants.IPCRoute.PROFILES_CURRENT, async () => {
    const synced = await syncRealtimeWorld();
    if (synced) {
      return synced;
    }

    return DatabaseClient.prisma.profile.findFirst({
      include: { player: true },
    });
  });

  ipcMain.handle(
    Constants.IPCRoute.PROFILES_UPDATE,
    async (_, query: Prisma.ProfileUpdateArgs) => {
      const profile = await DatabaseClient.prisma.profile.findFirst({
        include: { player: true },
      });

      const settings = Util.loadSettings(profile.settings);
      const newSettings = JSON.parse(
        query.data.settings as string
      ) as typeof Constants.Settings;

      // Reload logging level
      if (newSettings.general.logLevel !== settings.general.logLevel) {
        log.transports.console.level =
          newSettings.general.logLevel as log.LogLevel;
        log.transports.file.level =
          newSettings.general.logLevel as log.LogLevel;
      }

      // Rediscover game path if game mode changed
      if (
        newSettings.general.game !== settings.general.game &&
        settings.general.steamPath
      ) {
        try {
          newSettings.general.gamePath = await Game.discoverGamePath(
            newSettings.general.game,
            settings.general.steamPath
          );
        } catch {
          newSettings.general.gamePath = null;
        }
      }

      const updated = await DatabaseClient.prisma.profile.update({
        ...query,
        data: {
          ...query.data,
          settings: JSON.stringify(newSettings),
        },
      });

      WindowManager.sendAll(Constants.IPCRoute.PROFILES_CURRENT, updated);
      return updated;
    }
  );

  ipcMain.handle(Constants.IPCRoute.DEBUG_TEAM_OFFER, async (_, teamId: number) => { const profile = await DatabaseClient.prisma.profile.findFirst({ include: { player: true } }); if (!profile?.playerId) return null; const settings = Util.loadSettings(profile.settings); if (!settings.general.debug) { throw new Error('Debug mode is disabled.'); } const [targetTeam, noTeam] = await Promise.all([ DatabaseClient.prisma.team.findFirst({ where: { id: teamId } }), DatabaseClient.prisma.team.findFirst({ where: { OR: [{ slug: 'no-team' }, { name: 'No Team' }] } }), ]); if (!targetTeam) return null; const sourceTeamId = profile.teamId ?? noTeam?.id ?? targetTeam.id; return DatabaseClient.prisma.transfer.create({ data: { status: Constants.TransferStatus.TEAM_ACCEPTED, teamIdFrom: sourceTeamId, teamIdTo: targetTeam.id, playerId: profile.playerId, offers: { create: { status: Constants.TransferStatus.TEAM_ACCEPTED, cost: 0, wages: Math.max(profile.player?.wages ?? 5000, 5000), contractYears: 1, expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), }, }, }, include: { offers: true, to: true, from: true, target: true }, }); }); ipcMain.handle(Constants.IPCRoute.DEBUG_FACEIT_RESULT, async (_, outcome: 'W' | 'D' | 'L') => { const profile = await DatabaseClient.prisma.profile.findFirst({ include: { player: true } }); if (!profile?.playerId) return null; const settings = Util.loadSettings(profile.settings); if (!settings.general.debug) { throw new Error('Debug mode is disabled.'); } const randomScore = () => Math.floor(Math.random() * 12); const [scoreFor, scoreAgainst] = outcome === 'W' ? [13, randomScore()] : outcome === 'D' ? [15, 15] : [randomScore(), 13]; const delta = outcome === 'W' ? 25 : outcome === 'D' ? 0 : -25; const nextElo = Math.max(100, Math.min(5000, (profile.faceitElo ?? 1200) + delta)); const matchData: any = { matchType: 'FACEIT_DEBUG', date: profile.date.toISOString(), payload: JSON.stringify({ debug: true, source: 'settings', home: scoreFor, away: scoreAgainst }), status: Constants.MatchStatus.COMPLETED, totalRounds: scoreFor + scoreAgainst, faceitEloDelta: delta, faceitRating: nextElo, profileId: profile.id, players: { connect: [{ id: profile.playerId }] }, }; if (outcome !== 'D') { matchData.faceitIsWin = outcome === 'W'; } const [updatedProfile] = await Promise.all([ DatabaseClient.prisma.profile.update({ where: { id: profile.id }, data: { faceitElo: nextElo }, include: { player: true } }), DatabaseClient.prisma.player.update({ where: { id: profile.playerId }, data: { elo: { increment: delta }, xp: { increment: outcome === 'W' ? 50 : outcome === 'D' ? 25 : 10 }, }, }), DatabaseClient.prisma.match.create({ data: matchData }), ]); WindowManager.sendAll(Constants.IPCRoute.PROFILES_CURRENT, updatedProfile); return updatedProfile; }); ipcMain.handle(Constants.IPCRoute.SAVES_ALL, async () => {
    const saves = [];
    const files = await glob("save_*.db", {
      cwd: path.normalize(DatabaseClient.basePath),
    });

    for (const file of files) {
      const [databaseIdStr] = Array.from(
        file.matchAll(/save_(\d+)\.db/g),
        (groups) => groups[1]
      );
      if (!databaseIdStr) continue;

      const databaseId = Number(databaseIdStr);
      if (!Number.isFinite(databaseId) || databaseId === 0) continue;

      await DatabaseClient.disconnect();
      await DatabaseClient.connect(databaseId);

      const profile = await DatabaseClient.prisma.profile.findFirst({
        include: { player: true },
      });

      if (profile) {
        profile.id = databaseId;
        saves.push(profile);
      }
    }

    await DatabaseClient.disconnect();
    await DatabaseClient.connect();

    return saves.filter((save) => !!save && save.id !== 0);
  });

  ipcMain.handle(Constants.IPCRoute.SAVES_DELETE, async (_, id: number) => {
    const dbFileName = Util.getSaveFileName(id);
    const dbPath = path.join(DatabaseClient.basePath, dbFileName);

    if (!fs.existsSync(dbPath)) return Promise.reject();

    await DatabaseClient.forget(id);
    return fs.promises.unlink(dbPath);
  });

  /**
   * SQUAD (Player Career) — used by Squad Hub
   *
   * Returns the current team's players, or [] if teamless.
   */
  ipcMain.handle(Constants.IPCRoute.SQUAD_ALL, async () => {
    const profile = await DatabaseClient.prisma.profile.findFirst({
      include: {
        team: {
          include: {
            players: {
              include: {
                country: true, // needed for flags / names in PlayerCard
              },
            },
          },
        },
      },
    });

    if (!profile || !profile.team) {
      // teamless: Squad Hub will fall back to the "You are teamless" view
      return [];
    }

    return profile.team.players;
  });
}
