import { PermissionFlagsBits, type Client, type Guild, type Snowflake } from 'discord.js';
import { QueueRepeatMode, type GuildQueue, type Player } from 'discord-player';
import type { AppConfig } from '../../../core/config/env.js';
import { APP_VERSION } from '../../../core/config/version.js';
import type { DoctorService } from '../../diagnostics/services/doctorService.js';
import type { OperationalTelemetryService } from '../../diagnostics/services/operationalTelemetryService.js';
import type { GuildSettingsService } from '../../library/services/guildSettingsService.js';
import type { PlaybackSessionsService, StoredPlaybackSession } from '../../library/services/playbackSessionsService.js';
import { PreconditionCommandError, ValidationCommandError } from '../../commands/errors.js';
import type { MusicService, QueueMetadata } from '../../music/musicService.js';
import type { PlaybackSessionManager } from '../../music/playbackSessionManager.js';
import type {
  DashboardDoctorView,
  DashboardGuildSnapshot,
  DashboardGuildSummary,
  DashboardIncidentsView,
  DashboardMutationResult,
  DashboardOverviewView,
  DashboardPersistedSessionSummary,
  DashboardQueueSummary,
  DashboardSessionView,
  DashboardSettingsPatch,
} from '../contracts.js';
import type { GuildConfigResult } from '../../ui/view-models.js';

interface DashboardUseCaseDeps {
  config: AppConfig;
  client: Client;
  player: Player;
  doctor: DoctorService;
  operationalTelemetry: OperationalTelemetryService;
  guildSettings: GuildSettingsService;
  playbackSessions: PlaybackSessionsService;
  playbackSessionManager: PlaybackSessionManager;
  music: MusicService;
}

export function createDashboardUseCases(deps: DashboardUseCaseDeps) {
  return {
    async listGuilds(guildIds: string[]): Promise<DashboardGuildSummary[]> {
      const guilds = await Promise.all(guildIds.map((guildId) => resolveGuildSummary(deps.client, guildId)));
      return guilds.filter((guild): guild is DashboardGuildSummary => guild !== null);
    },

    async getOverview(guildId: string): Promise<DashboardOverviewView> {
      const snapshot = await getGuildSnapshot(deps, guildId);
      const routes = deps.music.describePlaybackRoutes();
      const persistedSession = await toPersistedSessionSummary(snapshot.guildEntity, snapshot.guild, snapshot.persistedSession);

      return {
        guild: snapshot.guild,
        appVersion: deps.config.appVersion ?? APP_VERSION,
        botReady: deps.client.isReady(),
        botTag: deps.client.user?.tag ?? null,
        queue: await buildQueueSummary(snapshot.guildEntity, snapshot.queue, snapshot.persistedSession),
        playback: {
          youtube: {
            requestedProfile: routes.youtube.requestedProfile,
            effectiveProfile: routes.youtube.effectiveProfile,
            pipeline: routes.youtube.pipeline,
            client: routes.youtube.client,
            highWaterMark: routes.youtube.highWaterMark,
            cookieConfigured: routes.youtube.cookieConfigured,
            generateWithPoToken: routes.youtube.generateWithPoToken,
            downgradeReason: routes.youtube.downgradeReason,
            routeKind: routes.youtube.routeKind,
            bridgeMode: routes.youtube.overrideBridgeMode,
          },
          spotify: {
            enabled: routes.spotify.enabled,
            pipeline: routes.spotify.pipeline,
            routeKind: routes.spotify.routeKind,
          },
        },
        recovery: snapshot.diagnostics,
        persistedSession,
      };
    },

    async getDoctor(guildId: string): Promise<DashboardDoctorView> {
      const snapshot = await getGuildSnapshot(deps, guildId);
      const report = await deps.doctor.run({
        client: deps.client,
        guild: snapshot.guildEntity,
        textChannelId: snapshot.queue?.metadata?.textChannelId ?? snapshot.persistedSession?.textChannelId ?? null,
        voiceChannelId: snapshot.queue?.channel?.id ?? snapshot.persistedSession?.voiceChannelId ?? null,
      });

      return {
        guild: snapshot.guild,
        report,
      };
    },

    async getIncidents(guildId: string): Promise<DashboardIncidentsView> {
      const [guild, telemetry] = await Promise.all([
        resolveGuildSummary(deps.client, guildId),
        deps.operationalTelemetry.getGuildSnapshotWithHistory(guildId),
      ]);

      if (!guild) {
        throw new ValidationCommandError('A guild solicitada nao esta disponivel para o dashboard.', {
          title: 'Guild indisponivel',
        });
      }

      return {
        guild,
        incidents: telemetry.recentIncidents,
      };
    },

    async getSettings(guildId: string): Promise<GuildConfigResult> {
      const snapshot = await getGuildSnapshot(deps, guildId);
      return snapshot.settings;
    },

    async getSession(guildId: string): Promise<DashboardSessionView> {
      const snapshot = await getGuildSnapshot(deps, guildId);

      return {
        guild: snapshot.guild,
        diagnostics: snapshot.diagnostics,
        persistedSession: await toPersistedSessionSummary(snapshot.guildEntity, snapshot.guild, snapshot.persistedSession),
        activeQueue: await buildQueueSummary(snapshot.guildEntity, snapshot.queue, snapshot.persistedSession),
      };
    },

    async updateSettings(guildId: string, patch: DashboardSettingsPatch): Promise<GuildConfigResult> {
      if (
        patch.prefix === undefined &&
        patch.defaultVolume === undefined &&
        patch.autoplayEnabled === undefined &&
        patch.resumeQueueEnabled === undefined
      ) {
        throw new ValidationCommandError('Nenhuma alteracao de configuracao foi enviada.', {
          title: 'Config vazia',
        });
      }

      const queue = deps.player.nodes.get<QueueMetadata>(guildId);

      if (patch.prefix !== undefined) {
        await deps.guildSettings.setPrefix(guildId, patch.prefix);
      }

      if (patch.defaultVolume !== undefined) {
        const settings = await deps.guildSettings.setDefaultVolume(guildId, patch.defaultVolume);
        if (queue) {
          queue.node.setVolume(settings.defaultVolume);
        }
      }

      if (patch.autoplayEnabled !== undefined) {
        await deps.music.setAutoplay(guildId, patch.autoplayEnabled);
      }

      if (patch.resumeQueueEnabled !== undefined) {
        await deps.guildSettings.setResumeQueue(guildId, patch.resumeQueueEnabled);
        await deps.playbackSessionManager.handleResumeQueueSettingChange(guildId, patch.resumeQueueEnabled);

        if (patch.resumeQueueEnabled) {
          await deps.playbackSessionManager.syncActiveQueue(guildId);
        }
      }

      return {
        settings: await deps.guildSettings.getSettings(guildId),
        sessionDiagnostics: await deps.playbackSessionManager.getDiagnostics(guildId),
        liveVolume: deps.player.nodes.get<QueueMetadata>(guildId)?.node.volume ?? null,
      };
    },

    async recover(guildId: string): Promise<DashboardMutationResult> {
      const result = await deps.playbackSessionManager.recoverForDashboard(guildId, deps.client.user?.id ?? 'phonix-dashboard');

      return notice(
        'PHONIX | Recovery iniciado',
        `A sessao salva voltou com **${result.recoveredTrackCount}** faixa(s) restaurada(s)${
          result.skippedTrackCount > 0 ? ` e **${result.skippedTrackCount}** pulada(s).` : '.'
        }`,
      );
    },

    async stop(guildId: string): Promise<DashboardMutationResult> {
      const queue = deps.player.nodes.get<QueueMetadata>(guildId);
      const persistedSession = await deps.playbackSessions.get(guildId);

      if (!queue && !persistedSession) {
        return info('PHONIX | Nenhuma sessao ativa', 'Nao existe fila ativa nem sessao pendente para encerrar nesta guild.');
      }

      await deps.playbackSessionManager.clearSessionForCommand(guildId, 'manualStop');

      if (queue) {
        const textChannelId = queue.metadata?.textChannelId ?? persistedSession?.textChannelId ?? null;
        const channelId = queue.channel?.id ?? persistedSession?.voiceChannelId ?? null;
        queue.delete();
        deps.operationalTelemetry.recordPlaybackSignal({
          guildId,
          type: 'leave',
          channelId,
          textChannelId,
          detail: 'dashboard_stop',
        });
      }

      return notice('PHONIX | Sessao encerrada', 'A fila atual foi encerrada e qualquer sessao pendente da guild foi limpa.');
    },
  };
}

async function getGuildSnapshot(deps: DashboardUseCaseDeps, guildId: string): Promise<DashboardGuildSnapshot & {
  guildEntity: Guild;
  queue: GuildQueue<QueueMetadata> | null;
}> {
  const guild = await resolveGuild(deps.client, guildId);
  const [summary, diagnostics, persistedSession] = await Promise.all([
    resolveGuildSummary(deps.client, guildId),
    deps.playbackSessionManager.getDiagnostics(guildId),
    deps.playbackSessions.get(guildId),
  ]);

  if (!guild || !summary) {
    throw new ValidationCommandError('A guild solicitada nao esta disponivel para o dashboard.', {
      title: 'Guild indisponivel',
    });
  }

  const settings = {
    settings: await deps.guildSettings.getSettings(guildId),
    sessionDiagnostics: diagnostics,
    liveVolume: deps.player.nodes.get<QueueMetadata>(guildId)?.node.volume ?? null,
  } satisfies GuildConfigResult;

  return {
    guild: summary,
    guildEntity: guild,
    settings,
    diagnostics,
    persistedSession,
    queue: deps.player.nodes.get<QueueMetadata>(guildId) ?? null,
  };
}

async function buildQueueSummary(
  guild: Guild,
  queue: GuildQueue<QueueMetadata> | null,
  persistedSession: StoredPlaybackSession | null,
): Promise<DashboardQueueSummary> {
  const voiceChannelId = queue?.channel?.id ?? persistedSession?.voiceChannelId ?? null;
  const textChannelId = queue?.metadata?.textChannelId ?? persistedSession?.textChannelId ?? null;
  const currentVoiceChannel =
    queue?.channel ??
    (voiceChannelId
      ? ((guild.channels.cache.get(voiceChannelId) ?? (await guild.channels.fetch(voiceChannelId).catch(() => null))) as {
          id: string;
          name?: string;
          bitrate?: number;
        } | null)
      : null);
  const currentTextChannel = textChannelId ? await resolveGuildChannelName(guild, textChannelId) : null;

  return {
    active: Boolean(queue && (queue.currentTrack || queue.size > 0)),
    currentTrackTitle: queue?.currentTrack?.title ?? null,
    queuedTrackCount: queue?.size ?? 0,
    liveVolume: queue?.node.volume ?? null,
    repeatMode: queue ? String(queue.repeatMode) : null,
    autoplayEnabled: Boolean(queue && queue.repeatMode === QueueRepeatMode.AUTOPLAY),
    voiceChannelId,
    voiceChannelName: currentVoiceChannel?.name ?? null,
    textChannelId,
    textChannelName: currentTextChannel,
    bitrateKbps:
      currentVoiceChannel && 'bitrate' in currentVoiceChannel && typeof currentVoiceChannel.bitrate === 'number'
        ? currentVoiceChannel.bitrate / 1000
        : null,
  };
}

async function toPersistedSessionSummary(
  guildEntity: Guild,
  guild: DashboardGuildSummary,
  session: StoredPlaybackSession | null,
): Promise<DashboardPersistedSessionSummary | null> {
  if (!session) {
    return null;
  }

  const [voiceChannelName, textChannelName] = await Promise.all([
    resolveGuildChannelName(guildEntity, session.voiceChannelId),
    resolveGuildChannelName(guildEntity, session.textChannelId),
  ]);

  return {
    guildId: session.guildId,
    voiceChannelId: session.voiceChannelId,
    voiceChannelName,
    textChannelId: session.textChannelId,
    textChannelName,
    currentTrackTitle: session.currentTrack?.title ?? null,
    itemCount: Number(Boolean(session.currentTrack)) + session.items.length,
    volume: session.volume,
    repeatMode: session.repeatMode,
    autoplayEnabled: session.autoplayEnabled,
    updatedAt: session.updatedAt,
  };
}

async function resolveGuild(client: Client, guildId: string) {
  return client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
}

async function resolveGuildSummary(client: Client, guildId: string): Promise<DashboardGuildSummary | null> {
  const guild = await resolveGuild(client, guildId);
  if (!guild) {
    return null;
  }

  return {
    id: guild.id,
    name: guild.name,
    iconUrl: guild.iconURL({ size: 128 }),
  };
}

async function resolveGuildChannelName(guild: Guild, channelId: Snowflake) {
  const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

  return channel?.name ?? null;
}

function notice(title: string, description: string): DashboardMutationResult {
  return {
    kind: 'notice',
    variant: 'success',
    title,
    description,
  };
}

function info(title: string, description: string): DashboardMutationResult {
  return {
    kind: 'notice',
    variant: 'info',
    title,
    description,
  };
}

export function hasAdministratorPermission(permissions: string) {
  try {
    return (BigInt(permissions) & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator;
  } catch {
    return false;
  }
}
