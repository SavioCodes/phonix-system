import { Player } from 'discord-player';
import { parseConfig, resolveDashboardConfig } from '../core/config/env.js';
import { createPrismaClient } from '../core/database/prisma.js';
import { createDiscordClient } from '../core/discord/create-discord-client.js';
import { logger } from '../core/logging/logger.js';
import { getSlashCommandData } from '../modules/commands/registry.js';
import { createDashboardServer } from '../modules/dashboard/http/createDashboardServer.js';
import { DiscordApiOAuthClient } from '../modules/dashboard/services/discordOAuthService.js';
import { checkFfmpeg, configureDiscordPlayerFfmpeg } from '../modules/music/ffmpeg.js';
import { MusicService, VOICE_CONNECTION_TIMEOUT_MS } from '../modules/music/musicService.js';
import { PlaybackSessionManager } from '../modules/music/playbackSessionManager.js';
import { installProcessWarningHandler } from './process-warnings.js';
import { registerClientEvents } from './register-client-events.js';
import { createServiceContainer, createUseCaseContainer } from './service-container.js';

const BLOCKED_STREAM_EXTRACTORS = ['com.discord-player.soundcloudextractor'] as const;

export async function createPhonixApp() {
  const config = parseConfig(process.env);
  const dashboard = resolveDashboardConfig(config.dashboard);
  const ffmpeg = checkFfmpeg(config.ffmpegPath);
  configureDiscordPlayerFfmpeg(config.ffmpegPath);
  const prisma = await createPrismaClient(config.databaseUrl);
  const client = createDiscordClient();
  const player = new Player(client, {
    ffmpegPath: config.ffmpegPath,
    connectionTimeout: VOICE_CONNECTION_TIMEOUT_MS,
    blockStreamFrom: [...BLOCKED_STREAM_EXTRACTORS],
  });
  const expectedSlashCommands = getSlashCommandData().length;

  const baseServices = createServiceContainer(config, prisma, player, ffmpeg, expectedSlashCommands);
  const music = new MusicService(player, config, baseServices.guildSettings);
  const playbackSessionManager = new PlaybackSessionManager(
    player,
    music,
    baseServices.guildSettings,
    baseServices.playbackSessions,
    baseServices.operationalTelemetry,
  );
  const services = {
    ...baseServices,
    music,
    playbackSessionManager,
    useCases: createUseCaseContainer({
      client,
      ...baseServices,
      music,
      playbackSessionManager,
    }),
  };

  installProcessWarningHandler(baseServices.operationalTelemetry);
  await music.setupExtractors();
  await music.stabilizeYoutubeRuntime();
  await baseServices.dashboardSessions.pruneExpired();
  baseServices.doctor.attachPlaybackSessionManager(playbackSessionManager);
  baseServices.doctor.attachMusicService(music);
  baseServices.ownerControl.attachPlaybackSessionManager(playbackSessionManager);
  baseServices.ownerControl.attachMusicService(music);
  playbackSessionManager.registerPlayerEvents();
  registerClientEvents(client, services);

  if (dashboard.requestedEnabled && !dashboard.effectiveEnabled) {
    logger.warn(
      {
        appVersion: config.appVersion,
        dashboardRequested: dashboard.requestedEnabled,
        dashboardPort: dashboard.port,
        dashboardDisableReason: dashboard.disableReason,
      },
      'PHONIX dashboard requested but not enabled',
    );
  }

  const dashboardServer = dashboard.effectiveEnabled
    ? await createDashboardServer({
        config,
        dashboard,
        client,
        authClient: new DiscordApiOAuthClient(config, dashboard),
        sessions: baseServices.dashboardSessions,
        useCases: services.useCases.dashboard,
      })
    : null;

  return {
    client,
    player,
    prisma,
    services,
    async start() {
      await client.login(config.discordToken);
      if (dashboardServer && dashboard.baseUrl) {
        await dashboardServer.listen({
          host: '0.0.0.0',
          port: dashboard.port,
        });

        logger.info(
          {
            appVersion: config.appVersion,
            dashboardBaseUrl: dashboard.baseUrl,
            dashboardPort: dashboard.port,
          },
          'PHONIX dashboard online',
        );
      }
    },
    async stop() {
      if (dashboardServer) {
        await dashboardServer.close();
      }
      await playbackSessionManager.prepareForShutdown();
      await baseServices.operationalTelemetry.flushPersistence();
      await player.destroy();
      await prisma.$disconnect();
      client.destroy();
    },
  };
}
