import { GuildQueueEvent, PlayerEvent, type Track } from 'discord-player';
import { Client, Events } from 'discord.js';
import type { CommandServices } from '../modules/commands/framework.js';
import { handleHelpComponentInteraction } from '../modules/commands/helpComponents.js';
import { handlePrefixMessage, handleSlashInteraction } from '../modules/commands/registry.js';
import { resolveDashboardConfig } from '../core/config/env.js';
import { PHONIX_OWNER_USER_ID } from '../core/security/ownerAccess.js';
import { APP_VERSION } from '../core/config/version.js';
import { logger } from '../core/logging/logger.js';
import {
  classifyLifecycleFault,
  classifyPlayerError,
  classifyQueueError,
} from '../modules/music/playbackFaults.js';
import { inferTrackPlaybackRoute } from '../modules/music/musicService.js';
import { serializeTrack } from '../modules/music/trackCodec.js';

export function registerClientEvents(client: Client, services: CommandServices) {
  const shouldIgnoreRuntimeFaults = () => services.playbackSessionManager?.isShuttingDown?.() === true;
  const dashboard = resolveDashboardConfig(services.config?.dashboard);
  const resolveTrackRoute = (track?: Track | null) => services.music?.inferTrackRoute?.(track ?? null) ?? inferTrackPlaybackRoute(track ?? null);

  client.on(Events.ClientReady, async (readyClient) => {
    logger.info(
      {
        appVersion: services.config?.appVersion ?? APP_VERSION,
        bot: readyClient.user.tag,
        ffmpegAvailable: services.ffmpeg.available,
        ffmpegDetail: services.ffmpeg.detail,
        dashboardRequested: dashboard.requestedEnabled,
        dashboardEnabled: dashboard.effectiveEnabled,
        dashboardDisableReason: dashboard.disableReason,
      },
      'PHONIX online',
    );

    let startupRecoveryIssue: string | null = null;

    try {
      await services.playbackSessionManager?.recoverPersistedSessions?.(readyClient);
    } catch (error) {
      startupRecoveryIssue = error instanceof Error ? error.message : 'erro desconhecido';
      logger.error({ err: error }, 'Failed to restore persisted playback sessions on startup');
    }

    const ownerNotification = await services.ownerControl?.sendStartupOnlineNotification?.(readyClient, {
      startupIssue: startupRecoveryIssue,
    });

    if (!ownerNotification || ownerNotification.skipped) {
      return;
    }

    if (ownerNotification.delivered) {
      logger.info(
        {
          ownerUserId: PHONIX_OWNER_USER_ID,
          officialGuildId: ownerNotification.report.officialGuild.id,
          officialGuildPresent: ownerNotification.report.officialGuild.present,
          criticalIssueCount: ownerNotification.report.criticalIssues.length,
        },
        'Owner startup DM delivered',
      );
      return;
    }

    logger.warn(
      {
        ownerUserId: PHONIX_OWNER_USER_ID,
        officialGuildId: ownerNotification.report.officialGuild.id,
        reason: ownerNotification.reason,
      },
      'Owner startup DM not delivered',
    );
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const handled = await handleHelpComponentInteraction(interaction, services);
      if (handled) {
        return;
      }
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    await handleSlashInteraction(interaction, services);
  });

  client.on(Events.MessageCreate, async (message) => {
    await handlePrefixMessage(message, services);
  });

  services.player.events.on(GuildQueueEvent.PlayerStart, async (queue, track) => {
    const route = resolveTrackRoute(track);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'player_start',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: track.title,
      provider: route.provider,
      pipeline: route.pipeline,
    });
    await recordTrackHistory(services, queue.guild.id, track);
  });

  services.player.events.on(GuildQueueEvent.PlayerPause, (queue) => {
    const route = resolveTrackRoute(queue.currentTrack ?? null);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'player_pause',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      provider: route.provider,
      pipeline: route.pipeline,
    });
  });

  services.player.events.on(GuildQueueEvent.PlayerResume, (queue) => {
    const route = resolveTrackRoute(queue.currentTrack ?? null);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'player_resume',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      provider: route.provider,
      pipeline: route.pipeline,
    });
  });

  services.player.events.on(GuildQueueEvent.PlayerSkip, (queue, track) => {
    const route = resolveTrackRoute(track);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'player_skip',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: track.title,
      provider: route.provider,
      pipeline: route.pipeline,
    });
  });

  services.player.events.on(GuildQueueEvent.PlayerFinish, (queue, track) => {
    const route = resolveTrackRoute(track);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'player_finish',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: track.title,
      provider: route.provider,
      pipeline: route.pipeline,
    });
  });

  services.player.events.on(GuildQueueEvent.Connection, (queue) => {
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'voice_connected',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
    });
  });

  services.player.events.on(GuildQueueEvent.ConnectionDestroyed, (queue) => {
    if (shouldIgnoreRuntimeFaults()) {
      return;
    }

    const descriptor = classifyLifecycleFault('connection_destroyed', queue);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'voice_connection_destroyed',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: descriptor.message,
    });
    services.operationalTelemetry.recordFailure({
      guildId: queue.guild.id,
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      stage: descriptor.stage,
      code: descriptor.code,
      message: descriptor.message,
      provider: descriptor.provider,
      pipeline: descriptor.pipeline,
      recoverable: descriptor.recoverable,
      terminal: descriptor.terminal,
    });
    void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'connection_destroyed').catch((error) => {
      logger.warn({ guildId: queue.guild.id, err: error }, 'Automatic recovery after connection destruction failed');
    });
  });

  services.player.events.on(GuildQueueEvent.Disconnect, (queue) => {
    if (shouldIgnoreRuntimeFaults()) {
      return;
    }

    const descriptor = classifyLifecycleFault('disconnect', queue);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'voice_disconnected',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: descriptor.message,
    });
    services.operationalTelemetry.recordFailure({
      guildId: queue.guild.id,
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      stage: descriptor.stage,
      code: descriptor.code,
      message: descriptor.message,
      provider: descriptor.provider,
      pipeline: descriptor.pipeline,
      recoverable: descriptor.recoverable,
      terminal: descriptor.terminal,
    });
    void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'disconnect').catch((error) => {
      logger.warn({ guildId: queue.guild.id, err: error }, 'Automatic recovery after disconnect failed');
    });
  });

  services.player.events.on(GuildQueueEvent.EmptyChannel, (queue) => {
    if (shouldIgnoreRuntimeFaults()) {
      return;
    }

    const descriptor = classifyLifecycleFault('empty_channel', queue);
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'voice_empty_channel',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: descriptor.message,
    });
    services.operationalTelemetry.recordFailure({
      guildId: queue.guild.id,
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      stage: descriptor.stage,
      code: descriptor.code,
      message: descriptor.message,
      provider: descriptor.provider,
      pipeline: descriptor.pipeline,
      recoverable: descriptor.recoverable,
      terminal: descriptor.terminal,
    });
    void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'disconnect').catch((error) => {
      logger.warn({ guildId: queue.guild.id, err: error }, 'Playback state could not be preserved after empty channel');
    });
  });

  services.player.events.on(GuildQueueEvent.QueueDelete, (queue) => {
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'queue_delete',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
    });
  });

  services.player.events.on(GuildQueueEvent.VolumeChange, (queue, oldVolume, newVolume) => {
    services.operationalTelemetry.recordPlaybackSignal({
      guildId: queue.guild.id,
      type: 'volume_change',
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      detail: `${oldVolume} -> ${newVolume}`,
    });
  });

  services.player.events.on(GuildQueueEvent.Error, (queue, error) => {
    if (shouldIgnoreRuntimeFaults()) {
      return;
    }

    const descriptor = classifyQueueError(error, queue);
    const payload = { guildId: queue.guild.id, err: error };

    services.operationalTelemetry.recordFailure({
      guildId: queue.guild.id,
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      stage: descriptor.stage,
      code: descriptor.code,
      message: descriptor.message,
      provider: descriptor.provider,
      pipeline: descriptor.pipeline,
      recoverable: descriptor.recoverable,
      terminal: descriptor.terminal,
    });

    if (isVoiceConnectionAbortError(error)) {
      logger.warn(payload, 'Guild queue connection timed out');

      if (!queue.isPlaying()) {
        queue.delete();
      }

      void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'queue_error').catch((recoveryError) => {
        logger.warn({ guildId: queue.guild.id, err: recoveryError }, 'Automatic recovery after queue timeout failed');
      });

      return;
    }

    if (descriptor.recoverable) {
      logger.warn(payload, 'Guild queue error marked as recoverable');
      void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'queue_error').catch((recoveryError) => {
        logger.warn({ guildId: queue.guild.id, err: recoveryError }, 'Automatic recovery after queue error failed');
      });
      return;
    }

    logger.error(payload, 'Guild queue error');
  });

  services.player.events.on(GuildQueueEvent.PlayerError, (queue, error) => {
    if (shouldIgnoreRuntimeFaults()) {
      return;
    }

    const payload = { guildId: queue.guild.id, err: error };
    const descriptor = classifyPlayerError(error, queue.currentTrack);

    services.operationalTelemetry.recordFailure({
      guildId: queue.guild.id,
      channelId: queue.channel?.id ?? null,
      textChannelId: queue.metadata?.textChannelId ?? null,
      stage: descriptor.stage,
      code: descriptor.code,
      message: descriptor.message,
      provider: descriptor.provider,
      pipeline: descriptor.pipeline,
      recoverable: descriptor.recoverable,
      terminal: descriptor.terminal,
    });

    if (isRecoverablePlaybackLookupError(error)) {
      logger.warn(payload, 'Audio player could not resolve a playable stream');
      void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'player_error').catch((recoveryError) => {
        logger.warn({ guildId: queue.guild.id, err: recoveryError }, 'Automatic recovery after player error failed');
      });
      return;
    }

    if (descriptor.recoverable) {
      logger.warn(payload, 'Audio player error marked as recoverable');
      void services.playbackSessionManager.handleRuntimeFault(queue, descriptor, 'player_error').catch((recoveryError) => {
        logger.warn({ guildId: queue.guild.id, err: recoveryError }, 'Automatic recovery after player error failed');
      });
      return;
    }

    logger.error(payload, 'Audio player error');
  });

  services.player.on(PlayerEvent.Error, (error) => {
    logger.error({ err: error }, 'Player runtime error');
  });
}

async function recordTrackHistory(services: CommandServices, guildId: string, track: Track) {
  if (!track.requestedBy?.id || track.requestedBy.bot) {
    return;
  }

  await services.history.record(track.requestedBy.id, guildId, serializeTrack(track));
}

function isVoiceConnectionAbortError(error: unknown) {
  return (
    error instanceof Error &&
    ((error.name === 'AbortError' && (error as { code?: string }).code === 'ABORT_ERR') ||
      /operation was aborted/iu.test(error.message) ||
      /voice connection status ready/iu.test(error.message))
  );
}

function isRecoverablePlaybackLookupError(error: unknown) {
  return (
    error instanceof Error &&
    (((error as { code?: string }).code === 'ERR_NO_RESULT' && /no results found for/iu.test(error.message)) ||
      /could not extract stream for this track/iu.test(error.message))
  );
}
