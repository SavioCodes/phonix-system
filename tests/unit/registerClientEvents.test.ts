import { EventEmitter } from 'node:events';
import { GuildQueueEvent, PlayerEvent } from 'discord-player';
import { Events } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/core/logging/logger.js';
import { registerClientEvents } from '../../src/app/register-client-events.js';
import { OperationalTelemetryService } from '../../src/modules/diagnostics/services/operationalTelemetryService.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('registerClientEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downgrades voice abort errors to warning level and cleans up idle queues', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        handleRuntimeFault: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    const deleteQueue = vi.fn();
    const abortError = new Error('The operation was aborted: This operation was aborted');
    abortError.name = 'AbortError';
    Object.assign(abortError, { code: 'ABORT_ERR' });

    player.events.emit(GuildQueueEvent.Error, {
      guild: { id: 'guild-1' },
      isPlaying: () => false,
      delete: deleteQueue,
    }, abortError);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(deleteQueue).toHaveBeenCalledTimes(1);
  });

  it('downgrades recoverable no-result player errors to warning level', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        handleRuntimeFault: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    const noResultError = new Error('No results found for "https://www.youtube.com/watch?v=test"');
    Object.assign(noResultError, { code: 'ERR_NO_RESULT' });

    player.events.emit(GuildQueueEvent.PlayerError, {
      guild: { id: 'guild-2' },
    }, noResultError);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs startup metadata when the client becomes ready', () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        recoverPersistedSessions: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ffmpeg ok',
      },
    } as never);

    client.emit(Events.ClientReady, {
      user: {
        tag: 'PHONIX#6820',
      },
    });

    expect(infoSpy).toHaveBeenCalledWith(
      {
        appVersion: '2.2.0',
        bot: 'PHONIX#6820',
        dashboardRequested: false,
        dashboardEnabled: false,
        dashboardDisableReason: null,
        ffmpegAvailable: true,
        ffmpegDetail: 'ffmpeg ok',
      },
      'PHONIX online',
    );
  });

  it('forwards startup recovery failures into the owner online notification flow', async () => {
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    const recoverPersistedSessions = vi.fn().mockRejectedValue(new Error('startup recovery failed'));
    const sendStartupOnlineNotification = vi.fn().mockResolvedValue({
      delivered: false,
      skipped: false,
      reason: 'dm blocked',
      report: {
        officialGuild: {
          id: '1489363867023835310',
          present: false,
        },
        criticalIssues: [],
      },
    });

    registerClientEvents(client as never, {
      player,
      ownerControl: {
        sendStartupOnlineNotification,
      },
      playbackSessionManager: {
        recoverPersistedSessions,
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ffmpeg ok',
      },
    } as never);

    client.emit(Events.ClientReady, {
      user: {
        tag: 'PHONIX#6820',
      },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(sendStartupOnlineNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        user: {
          tag: 'PHONIX#6820',
        },
      }),
      {
        startupIssue: 'startup recovery failed',
      },
    );
  });

  it('records failure telemetry and dispatches runtime recovery for destroyed connections', () => {
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    const operationalTelemetry = new OperationalTelemetryService();
    const handleRuntimeFault = vi.fn().mockResolvedValue(undefined);

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        handleRuntimeFault,
      },
      operationalTelemetry,
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    player.events.emit(GuildQueueEvent.ConnectionDestroyed, {
      guild: { id: 'guild-3' },
      channel: { id: 'voice-9' },
      metadata: { textChannelId: 'text-9' },
      currentTrack: {
        url: 'https://youtube.com/watch?v=test',
        raw: { source: 'youtube' },
      },
    });

    const snapshot = operationalTelemetry.getGuildSnapshot('guild-3');
    expect(snapshot.playbackSignals.voice_connection_destroyed).toBe(1);
    expect(snapshot.failures.byCode.voice_connection_destroyed).toBe(1);
    expect(handleRuntimeFault).toHaveBeenCalledTimes(1);
  });

  it('ignores runtime recovery faults while the bot is shutting down', () => {
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    const operationalTelemetry = {
      recordFailure: vi.fn(),
      recordPlaybackSignal: vi.fn(),
    };
    const handleRuntimeFault = vi.fn().mockResolvedValue(undefined);

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        isShuttingDown: () => true,
        handleRuntimeFault,
      },
      operationalTelemetry,
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    player.events.emit(GuildQueueEvent.ConnectionDestroyed, {
      guild: { id: 'guild-4' },
      channel: { id: 'voice-10' },
      metadata: { textChannelId: 'text-10' },
    });

    expect(operationalTelemetry.recordPlaybackSignal).not.toHaveBeenCalled();
    expect(operationalTelemetry.recordFailure).not.toHaveBeenCalled();
    expect(handleRuntimeFault).not.toHaveBeenCalled();
  });

  it('routes help component interactions through the interactive help handler', async () => {
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    const help = vi.fn().mockResolvedValue({
      prefix: '!',
      currentPage: 'playback',
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
        currentPage: 'playback',
        prefix: '!',
      },
      resumeQueueEnabled: true,
      hasActiveQueue: true,
      memberIsAdmin: false,
      memberIsOwner: false,
      pages: {
        home: { id: 'home', label: 'Inicio', title: 'PHONIX | Comece por aqui', description: 'inicio', fields: [] },
        playback: { id: 'playback', label: 'Playback', title: 'PHONIX | Playback', description: 'playback', fields: [] },
        library: { id: 'library', label: 'Biblioteca', title: 'PHONIX | Biblioteca', description: 'library', fields: [] },
        recovery: { id: 'recovery', label: 'Recovery', title: 'PHONIX | Recovery', description: 'recovery', fields: [] },
        admin: { id: 'admin', label: 'Admin', title: 'PHONIX | Admin', description: 'admin', fields: [] },
      },
      sessionDiagnostics: createSessionDiagnostics({
        state: 'pending',
        health: 'recoverable',
        healthDetail: 'Sessao persistida pronta para recover com 1 faixa(s).',
        hasPersistedSession: true,
        itemCount: 1,
        recoveryReady: true,
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        lastSyncReason: 'recover',
        lastRecoveryTrigger: 'startup',
        lastRecoveryStatus: 'success',
        lastRecoveryAttemptAt: new Date('2026-04-02T00:00:00.000Z'),
        lastRecoveryAttempts: 1,
        lastRecoveryDurationMs: 1000,
        lastSuccessfulRecoveryAt: new Date('2026-04-02T00:00:00.000Z'),
        lastRecoveryRecoveredTrackCount: 1,
      }),
    });

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        recoverPersistedSessions: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
      useCases: {
        admin: {
          help,
        },
      },
    } as never);

    const update = vi.fn().mockResolvedValue(undefined);

    client.emit(Events.InteractionCreate, {
      customId: 'help:select:home:guild-1:user-1',
      values: ['playback'],
      user: { id: 'user-1' },
      guildId: 'guild-1',
      guild: {
        members: {
          fetch: vi.fn().mockResolvedValue({
            permissions: {
              has: () => false,
            },
          }),
        },
      },
      inGuild: () => true,
      isButton: () => false,
      isStringSelectMenu: () => true,
      isChatInputCommand: () => false,
      deferred: false,
      replied: false,
      update,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(help).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: expect.anything(),
      userId: 'user-1',
      currentPage: 'playback',
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('logs slash handler failures instead of letting the client crash', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        recoverPersistedSessions: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    client.emit(Events.InteractionCreate, {
      id: 'interaction-1',
      commandName: 'play',
      user: { id: 'user-1' },
      guildId: 'guild-1',
      inGuild: () => true,
      isButton: () => false,
      isStringSelectMenu: () => false,
      isChatInputCommand: () => true,
      guild: {
        members: {
          fetch: vi.fn().mockRejectedValue(new Error('member fetch failed')),
        },
      },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        interactionId: 'interaction-1',
        commandName: 'play',
        guildId: 'guild-1',
        userId: 'user-1',
        err: expect.any(Error),
      }),
      'Slash interaction handling failed',
    );
  });

  it('downgrades expected automatic recovery exhaustion to debug level in runtime handlers', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        handleRuntimeFault: vi.fn().mockRejectedValue(new Error('Recovery automatico abortado apos 2 tentativa(s) em 90s.')),
      },
      operationalTelemetry: {
        recordFailure: vi.fn(),
        recordPlaybackSignal: vi.fn(),
      },
      history: {
        record: vi.fn(),
      },
      ffmpeg: {
        available: true,
        detail: 'ok',
      },
    } as never);

    player.events.emit(GuildQueueEvent.ConnectionDestroyed, {
      guild: { id: 'guild-recovery' },
      channel: { id: 'voice-recovery' },
      metadata: { textChannelId: 'text-recovery' },
      currentTrack: {
        url: 'https://www.youtube.com/watch?v=test',
        raw: { source: 'youtube' },
      },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-recovery',
        err: expect.any(Error),
      }),
      'Automatic recovery after connection destruction failed',
    );
    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-recovery',
        err: expect.any(Error),
      }),
      'Automatic recovery after connection destruction failed',
    );
  });
});
