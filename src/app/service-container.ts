import type { PrismaClient } from '@prisma/client';
import type { Player } from 'discord-player';
import type { Client } from 'discord.js';
import type { AppConfig } from '../core/config/env.js';
import type { FfmpegStatus } from '../modules/music/ffmpeg.js';
import { DoctorService } from '../modules/diagnostics/services/doctorService.js';
import { createAdminUseCases } from '../modules/diagnostics/use-cases/adminUseCases.js';
import { OwnerControlService } from '../modules/diagnostics/services/ownerControlService.js';
import { createOwnerUseCases } from '../modules/diagnostics/use-cases/ownerUseCases.js';
import { OperationalTelemetryService } from '../modules/diagnostics/services/operationalTelemetryService.js';
import { OperationalTelemetryStoreService } from '../modules/diagnostics/services/operationalTelemetryStoreService.js';
import { FavoritesService } from '../modules/library/services/favoritesService.js';
import { GuildSettingsService } from '../modules/library/services/guildSettingsService.js';
import { HistoryService } from '../modules/library/services/historyService.js';
import { PlaybackSessionsService } from '../modules/library/services/playbackSessionsService.js';
import { PlaylistsService } from '../modules/library/services/playlistsService.js';
import { createLibraryUseCases } from '../modules/library/use-cases/libraryUseCases.js';
import { createPlaybackUseCases } from '../modules/music/use-cases/playbackUseCases.js';
import type { MusicService } from '../modules/music/musicService.js';
import type { PlaybackSessionManager } from '../modules/music/playbackSessionManager.js';
import { DashboardSessionsService } from '../modules/dashboard/services/dashboardSessionsService.js';
import { createDashboardUseCases } from '../modules/dashboard/use-cases/dashboardUseCases.js';

export interface AppServiceContainer {
  config: AppConfig;
  prisma: PrismaClient;
  player: Player;
  ffmpeg: FfmpegStatus;
  doctor: DoctorService;
  ownerControl: OwnerControlService;
  operationalTelemetry: OperationalTelemetryService;
  operationalTelemetryStore: OperationalTelemetryStoreService;
  guildSettings: GuildSettingsService;
  playbackSessions: PlaybackSessionsService;
  dashboardSessions: DashboardSessionsService;
  favorites: FavoritesService;
  playlists: PlaylistsService;
  history: HistoryService;
}

export interface AppUseCaseContainer {
  playback: ReturnType<typeof createPlaybackUseCases>;
  library: ReturnType<typeof createLibraryUseCases>;
  admin: ReturnType<typeof createAdminUseCases>;
  owner: ReturnType<typeof createOwnerUseCases>;
  dashboard: ReturnType<typeof createDashboardUseCases>;
}

export function createServiceContainer(
  config: AppConfig,
  prisma: PrismaClient,
  player: Player,
  ffmpeg: FfmpegStatus,
  expectedSlashCommands: number,
): AppServiceContainer {
  const guildSettings = new GuildSettingsService(prisma);
  const playbackSessions = new PlaybackSessionsService(prisma);
  const dashboardSessions = new DashboardSessionsService(prisma, config.dashboard?.sessionSecret ?? 'phonix-dashboard-disabled');
  const operationalTelemetryStore = new OperationalTelemetryStoreService(prisma);
  const operationalTelemetry = new OperationalTelemetryService(operationalTelemetryStore);
  const ownerControl = new OwnerControlService({
    config,
    prisma,
    ffmpeg,
    expectedSlashCommands,
    player,
    operationalTelemetry,
    operationalTelemetryStore,
    guildSettings,
    playbackSessions,
  });

  return {
    config,
    prisma,
    player,
    ffmpeg,
    doctor: new DoctorService(
      config,
      prisma,
      ffmpeg,
      expectedSlashCommands,
      guildSettings,
      playbackSessions,
      player,
      operationalTelemetry,
      operationalTelemetryStore,
    ),
    ownerControl,
    operationalTelemetry,
    operationalTelemetryStore,
    guildSettings,
    playbackSessions,
    dashboardSessions,
    favorites: new FavoritesService(prisma),
    playlists: new PlaylistsService(prisma),
    history: new HistoryService(prisma),
  };
}

export function createUseCaseContainer(
  services: AppServiceContainer & {
    client: Client;
    music: MusicService;
    playbackSessionManager: PlaybackSessionManager;
  },
): AppUseCaseContainer {
  return {
    playback: createPlaybackUseCases({
      player: services.player,
      ffmpeg: services.ffmpeg,
      music: services.music,
      playbackSessionManager: services.playbackSessionManager,
      operationalTelemetry: services.operationalTelemetry,
    }),
    library: createLibraryUseCases({
      player: services.player,
      ffmpeg: services.ffmpeg,
      music: services.music,
      favorites: services.favorites,
      playlists: services.playlists,
      history: services.history,
    }),
    admin: createAdminUseCases({
      doctor: services.doctor,
      guildSettings: services.guildSettings,
      playbackSessionManager: services.playbackSessionManager,
      music: services.music,
      player: services.player,
    }),
    owner: createOwnerUseCases({
      ownerControl: services.ownerControl,
    }),
    dashboard: createDashboardUseCases({
      config: services.config,
      client: services.client,
      player: services.player,
      doctor: services.doctor,
      operationalTelemetry: services.operationalTelemetry,
      guildSettings: services.guildSettings,
      playbackSessions: services.playbackSessions,
      playbackSessionManager: services.playbackSessionManager,
      music: services.music,
    }),
  };
}
