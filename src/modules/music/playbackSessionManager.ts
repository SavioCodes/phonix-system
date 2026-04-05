import { GuildQueueEvent, QueueRepeatMode, type GuildQueue, type Player } from 'discord-player';
import { PermissionFlagsBits, type Client, type Guild, type GuildMember, type StageChannel, type VoiceChannel } from 'discord.js';
import { logger } from '../../core/logging/logger.js';
import type { OperationalTelemetryService } from '../diagnostics/services/operationalTelemetryService.js';
import type { GuildSettingsService } from '../library/services/guildSettingsService.js';
import type { PlaybackSessionsService, StoredPlaybackSession } from '../library/services/playbackSessionsService.js';
import {
  classifyQueueError,
  type PlaybackFaultDescriptor,
  type RecoveryTrigger,
} from './playbackFaults.js';
import { inferTrackPlaybackRoute, MusicService, PlaybackUnavailableError, type QueueMetadata } from './musicService.js';
import { serializeTrack, type StoredTrack } from './trackCodec.js';

const SESSION_SYNC_DEBOUNCE_MS = 400;
const MAX_AUTOMATIC_RECOVERY_ATTEMPTS = 2;
const RECOVERY_WINDOW_MS = 90_000;
const RECOVERY_RETRY_DELAY_MS = 1_500;
const STALE_PENDING_SESSION_MS = 24 * 60 * 60 * 1000;

export type PlaybackSessionSyncReason =
  | 'playerStart'
  | 'audioTrackAdd'
  | 'audioTracksAdd'
  | 'audioTrackRemove'
  | 'audioTracksRemove'
  | 'playerSkip'
  | 'playerFinish'
  | 'volumeChange'
  | 'queueDelete'
  | 'disconnect'
  | 'emptyQueue'
  | 'configDisabled'
  | 'recover'
  | 'shutdown'
  | 'manualStop'
  | 'manualLeave';

export type PlaybackSessionState = 'none' | 'pending' | 'active' | 'recovering';
export type PlaybackSessionHealth = 'healthy' | 'recoverable' | 'partial' | 'broken' | 'disabled';

export interface PlaybackRecoveryResult {
  session: StoredPlaybackSession;
  requestedTrackCount: number;
  recoveredTrackCount: number;
  skippedTrackCount: number;
  restoredCurrentTrack: boolean;
  restoredUpcomingTrackCount: number;
  volume: number;
  repeatMode: QueueRepeatMode;
  autoplayEnabled: boolean;
  sessionHealth: PlaybackSessionHealth;
  healthDetail: string;
  manualInterventionRequired: boolean;
  autoRecovered: boolean;
  attemptCount: number;
}

export interface PlaybackSessionDiagnostics {
  state: PlaybackSessionState;
  health: PlaybackSessionHealth;
  healthDetail: string;
  hasPersistedSession: boolean;
  hasActiveQueue: boolean;
  autoResumeEnabled: boolean;
  itemCount: number;
  liveItemCount: number;
  hasCurrentTrack: boolean;
  recoveryReady: boolean;
  manualInterventionRequired: boolean;
  stalePersistedSession: boolean;
  updatedAt: Date | null;
  voiceChannelId: string | null;
  textChannelId: string | null;
  lastSyncReason: PlaybackSessionSyncReason | null;
  lastAutoRecoverBlockReason: string | null;
  lastRecoveryTrigger: RecoveryTrigger | null;
  lastRecoveryStatus: 'idle' | 'running' | 'success' | 'failed' | 'aborted' | null;
  lastRecoveryAttemptAt: Date | null;
  lastRecoveryAttempts: number;
  lastRecoveryDurationMs: number | null;
  lastSuccessfulRecoveryAt: Date | null;
  lastRecoveryRecoveredTrackCount: number;
  lastRecoverySkippedTrackCount: number;
}

interface RecoveryRuntimeState {
  active: boolean;
  windowStartedAt: number | null;
  attemptsInWindow: number;
  lastTrigger: RecoveryTrigger | null;
  lastStatus: PlaybackSessionDiagnostics['lastRecoveryStatus'];
  lastAttemptAt: Date | null;
  lastDurationMs: number | null;
  lastSuccessfulRecoveryAt: Date | null;
  lastRecoveredTrackCount: number;
  lastSkippedTrackCount: number;
}

interface RuntimeState {
  lastSyncReason: PlaybackSessionSyncReason | null;
  lastAutoRecoverBlockReason: string | null;
  recovery: RecoveryRuntimeState;
}

interface RecoveryCandidate {
  session: StoredPlaybackSession;
  source: 'live' | 'persisted';
  voiceChannel: VoiceChannel | StageChannel | null;
}

interface RecoveryExecutionInput {
  guildId: string;
  trigger: RecoveryTrigger;
  voiceChannel: VoiceChannel | StageChannel;
  session: StoredPlaybackSession;
  requestedById: string;
  metadata: QueueMetadata;
  auto: boolean;
  source?: 'slash' | 'prefix' | 'dashboard' | 'system';
  maxAttempts: number;
}

export class PlaybackSessionManager {
  private readonly syncTimers = new Map<string, NodeJS.Timeout>();
  private readonly runtimeState = new Map<string, RuntimeState>();
  private readonly ignoredQueueDeletes = new Set<string>();
  private shuttingDown = false;
  private restoredOnReady = false;

  public constructor(
    private readonly player: Player,
    private readonly music: MusicService,
    private readonly guildSettings: GuildSettingsService,
    private readonly playbackSessions: PlaybackSessionsService,
    private readonly operationalTelemetry: OperationalTelemetryService,
  ) {}

  public registerPlayerEvents() {
    const schedule = (reason: PlaybackSessionSyncReason) => (queue: GuildQueue<QueueMetadata>) => {
      void this.scheduleSync(queue, reason);
    };

    this.player.events.on(GuildQueueEvent.PlayerStart, schedule('playerStart'));
    this.player.events.on(GuildQueueEvent.AudioTrackAdd, schedule('audioTrackAdd'));
    this.player.events.on(GuildQueueEvent.AudioTracksAdd, schedule('audioTracksAdd'));
    this.player.events.on(GuildQueueEvent.AudioTrackRemove, schedule('audioTrackRemove'));
    this.player.events.on(GuildQueueEvent.AudioTracksRemove, schedule('audioTracksRemove'));
    this.player.events.on(GuildQueueEvent.PlayerSkip, schedule('playerSkip'));
    this.player.events.on(GuildQueueEvent.PlayerFinish, schedule('playerFinish'));
    this.player.events.on(GuildQueueEvent.VolumeChange, schedule('volumeChange'));

    this.player.events.on(GuildQueueEvent.EmptyQueue, (queue) => {
      void this.clearPersistedSession(queue.guild.id, 'emptyQueue');
    });

    this.player.events.on(GuildQueueEvent.Disconnect, (queue) => {
      const runtime = this.getRuntimeState(queue.guild.id);
      runtime.lastSyncReason = 'disconnect';
    });

    this.player.events.on(GuildQueueEvent.QueueDelete, (queue) => {
      if (this.ignoredQueueDeletes.delete(queue.guild.id)) {
        return;
      }

      const runtime = this.getRuntimeState(queue.guild.id);
      runtime.lastSyncReason = 'queueDelete';
    });
  }

  public async recoverPersistedSessions(client: Client) {
    if (this.restoredOnReady) {
      return;
    }

    this.restoredOnReady = true;
    if (!client.user) {
      return;
    }

    const botUserId = client.user.id;
    const sessions = await this.playbackSessions.list();

    for (const session of sessions) {
      await this.tryAutoRecoverSession(client, session, botUserId);
    }
  }

  public async recoverForMember(member: GuildMember, metadata: QueueMetadata, requestedBy: GuildMember['user']): Promise<PlaybackRecoveryResult> {
    const session = await this.playbackSessions.get(member.guild.id);
    if (!session) {
      throw new Error('Nao existe sessao pendente para recuperar neste servidor.');
    }

    const voiceChannel = this.music.requireMemberVoiceChannel(member);
    const existingQueue = this.player.nodes.get<QueueMetadata>(member.guild.id);
    if (existingQueue?.channel && (existingQueue.currentTrack || existingQueue.size > 0 || this.getRuntimeState(member.guild.id).recovery.active)) {
      throw new Error('Ja existe uma fila ativa ou recovery em andamento neste servidor. Use stop antes de recuperar outra sessao.');
    }

    return this.executeRecovery({
      guildId: member.guild.id,
      trigger: 'manual',
      voiceChannel,
      session,
      requestedById: requestedBy.id,
      metadata,
      auto: false,
      source: 'system',
      maxAttempts: 1,
    });
  }

  public async recoverForDashboard(guildId: string, requestedById: string): Promise<PlaybackRecoveryResult> {
    const session = await this.playbackSessions.get(guildId);
    if (!session) {
      throw new Error('Nao existe sessao pendente para recuperar neste servidor.');
    }

    const guild = await resolveGuild(this.player.client, guildId);
    if (!guild) {
      throw new Error('A guild da sessao salva nao esta mais disponivel.');
    }

    const voiceChannel = await resolveVoiceChannel(guild, session.voiceChannelId);
    const existingQueue = this.player.nodes.get<QueueMetadata>(guildId);
    if (existingQueue?.channel && (existingQueue.currentTrack || existingQueue.size > 0 || this.getRuntimeState(guildId).recovery.active)) {
      throw new Error('Ja existe uma fila ativa ou recovery em andamento neste servidor. Use stop antes de recuperar outra sessao.');
    }

    const validationFailure = await this.validateRecoveryChannel(guild, voiceChannel, true, session);
    if (validationFailure) {
      this.recordSessionSignal(
        guildId,
        { textChannelId: session.textChannelId },
        session.voiceChannelId,
        classifySessionSignalFromBlock(validationFailure),
        validationFailure,
      );
      throw new Error(validationFailure);
    }

    return this.executeRecovery({
      guildId,
      trigger: 'manual',
      voiceChannel: voiceChannel!,
      session,
      requestedById,
      metadata: { textChannelId: session.textChannelId },
      auto: false,
      source: 'dashboard',
      maxAttempts: 1,
    });
  }

  public async handleRuntimeFault(
    queue: GuildQueue<QueueMetadata>,
    descriptor: PlaybackFaultDescriptor,
    trigger: RecoveryTrigger,
  ) {
    if (this.shuttingDown) {
      return;
    }

    const guildId = queue.guild.id;
    const runtime = this.getRuntimeState(guildId);

    if (runtime.recovery.active) {
      runtime.lastAutoRecoverBlockReason = 'Ja existe um recovery em andamento para esta guild.';
      this.operationalTelemetry.recordRecoveryAborted({
        guildId,
        trigger,
        attempt: runtime.recovery.attemptsInWindow,
        reason: runtime.lastAutoRecoverBlockReason,
        terminal: false,
      });
      return;
    }

    const candidate = await this.buildRecoveryCandidate(guildId, queue);
    if (!candidate) {
      runtime.lastAutoRecoverBlockReason = 'Nenhuma sessao valida ficou disponivel para recovery.';
      this.recordSessionSignal(guildId, queue.metadata, queue.channel?.id ?? null, 'session_broken', runtime.lastAutoRecoverBlockReason);
      this.operationalTelemetry.recordRecoveryAborted({
        guildId,
        trigger,
        attempt: 0,
        reason: runtime.lastAutoRecoverBlockReason,
        terminal: true,
      });
      return;
    }

    const autoResumeEnabled = await this.guildSettings.isResumeQueueEnabled(guildId);
    const validationFailure = await this.validateRecoveryChannel(queue.guild, candidate.voiceChannel, autoResumeEnabled, candidate.session);
    if (validationFailure) {
      runtime.lastAutoRecoverBlockReason = validationFailure;
      this.recordSessionSignal(
        guildId,
        { textChannelId: candidate.session.textChannelId },
        candidate.session.voiceChannelId,
        classifySessionSignalFromBlock(validationFailure),
        validationFailure,
      );
      this.operationalTelemetry.recordRecoveryAborted({
        guildId,
        trigger,
        attempt: 0,
        reason: validationFailure,
        terminal: false,
      });
      return;
    }

    if (!descriptor.recoverable || descriptor.terminal) {
      runtime.lastAutoRecoverBlockReason = `Falha terminal detectada: ${descriptor.message}`;
      this.recordSessionSignal(
        guildId,
        { textChannelId: candidate.session.textChannelId },
        candidate.session.voiceChannelId,
        'session_broken',
        runtime.lastAutoRecoverBlockReason,
      );
      this.operationalTelemetry.recordRecoveryAborted({
        guildId,
        trigger,
        attempt: 0,
        reason: runtime.lastAutoRecoverBlockReason,
        terminal: descriptor.terminal,
      });
      return;
    }

    await this.executeRecovery({
      guildId,
      trigger,
      voiceChannel: candidate.voiceChannel!,
      session: candidate.session,
      requestedById: this.player.client.user?.id ?? 'phonix-system',
      metadata: { textChannelId: candidate.session.textChannelId },
      auto: true,
      source: 'system',
      maxAttempts: MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
    });
  }

  public async getDiagnostics(guildId: string): Promise<PlaybackSessionDiagnostics> {
    const [session, autoResumeEnabled] = await Promise.all([
      this.playbackSessions.get(guildId),
      this.guildSettings.isResumeQueueEnabled(guildId),
    ]);
    const runtime = this.getRuntimeState(guildId);
    const queue = this.player.nodes.get<QueueMetadata>(guildId);
    const hasActiveQueue = Boolean(queue && (Boolean(queue.currentTrack) || queue.size > 0 || queue.isPlaying()));
    const persistedItemCount = session ? Number(Boolean(session.currentTrack)) + session.items.length : 0;
    const liveItemCount = queue ? Number(Boolean(queue.currentTrack)) + queue.size : 0;
    const state: PlaybackSessionState = runtime.recovery.active ? 'recovering' : hasActiveQueue ? 'active' : session ? 'pending' : 'none';
    const health = assessSessionHealth({
      state,
      session,
      autoResumeEnabled,
      hasActiveQueue,
      liveItemCount,
      runtime,
    });

    return {
      state,
      health: health.health,
      healthDetail: health.detail,
      hasPersistedSession: Boolean(session),
      hasActiveQueue,
      autoResumeEnabled,
      itemCount: persistedItemCount,
      liveItemCount,
      hasCurrentTrack: Boolean(queue?.currentTrack ?? session?.currentTrack),
      recoveryReady: health.recoveryReady,
      manualInterventionRequired: health.manualInterventionRequired,
      stalePersistedSession: health.stalePersistedSession,
      updatedAt: session?.updatedAt ?? null,
      voiceChannelId: session?.voiceChannelId ?? null,
      textChannelId: session?.textChannelId ?? null,
      lastSyncReason: runtime.lastSyncReason,
      lastAutoRecoverBlockReason: runtime.lastAutoRecoverBlockReason,
      lastRecoveryTrigger: runtime.recovery.lastTrigger,
      lastRecoveryStatus: runtime.recovery.lastStatus,
      lastRecoveryAttemptAt: runtime.recovery.lastAttemptAt,
      lastRecoveryAttempts: runtime.recovery.attemptsInWindow,
      lastRecoveryDurationMs: runtime.recovery.lastDurationMs,
      lastSuccessfulRecoveryAt: runtime.recovery.lastSuccessfulRecoveryAt,
      lastRecoveryRecoveredTrackCount: runtime.recovery.lastRecoveredTrackCount,
      lastRecoverySkippedTrackCount: runtime.recovery.lastSkippedTrackCount,
    };
  }

  public async handleResumeQueueSettingChange(guildId: string, enabled: boolean) {
    if (enabled) {
      const runtime = this.getRuntimeState(guildId);
      runtime.lastSyncReason = null;
      runtime.lastAutoRecoverBlockReason = null;
      return;
    }

    await this.clearPersistedSession(guildId, 'configDisabled', {
      lastAutoRecoverBlockReason: 'Recuperacao automatica desativada neste servidor.',
    });
  }

  public async syncActiveQueue(guildId: string) {
    const queue = this.player.nodes.get<QueueMetadata>(guildId);
    if (!queue) {
      return;
    }

    await this.syncQueue(queue, 'recover');
  }

  public async clearSessionForCommand(guildId: string, reason: 'manualStop' | 'manualLeave') {
    await this.clearPersistedSession(guildId, reason);
    this.ignoredQueueDeletes.add(guildId);
  }

  public isShuttingDown() {
    return this.shuttingDown;
  }

  public async prepareForShutdown() {
    this.shuttingDown = true;

    for (const timer of this.syncTimers.values()) {
      clearTimeout(timer);
    }
    this.syncTimers.clear();

    const liveQueues = Array.from(this.player.nodes.cache.values()) as GuildQueue<QueueMetadata>[];
    await Promise.all(
      liveQueues
        .filter((queue) => Boolean(queue.channel) && (Boolean(queue.currentTrack) || queue.size > 0))
        .map((queue) => this.syncQueue(queue, 'shutdown')),
    );
  }

  private getRuntimeState(guildId: string): RuntimeState {
    const existing = this.runtimeState.get(guildId);
    if (existing) {
      return existing;
    }

    const created: RuntimeState = {
      lastSyncReason: null,
      lastAutoRecoverBlockReason: null,
      recovery: {
        active: false,
        windowStartedAt: null,
        attemptsInWindow: 0,
        lastTrigger: null,
        lastStatus: 'idle',
        lastAttemptAt: null,
        lastDurationMs: null,
        lastSuccessfulRecoveryAt: null,
        lastRecoveredTrackCount: 0,
        lastSkippedTrackCount: 0,
      },
    };

    this.runtimeState.set(guildId, created);
    return created;
  }

  private async scheduleSync(queue: GuildQueue<QueueMetadata>, reason: PlaybackSessionSyncReason) {
    if (this.shuttingDown) {
      return;
    }

    const guildId = queue.guild.id;
    const existingTimer = this.syncTimers.get(guildId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.syncTimers.set(
      guildId,
      setTimeout(() => {
        this.syncTimers.delete(guildId);
        void this.syncQueue(queue, reason);
      }, SESSION_SYNC_DEBOUNCE_MS),
    );
  }

  private async syncQueue(queue: GuildQueue<QueueMetadata>, reason: PlaybackSessionSyncReason) {
    const guildId = queue.guild.id;
    const metadata = queue.metadata;

    if (!metadata?.textChannelId || !queue.channel) {
      return;
    }

    const autoResumeEnabled = await this.guildSettings.isResumeQueueEnabled(guildId);
    if (!autoResumeEnabled) {
      await this.clearPersistedSession(guildId, 'configDisabled', {
        lastAutoRecoverBlockReason: 'Recuperacao automatica desativada neste servidor.',
      });
      return;
    }

    const currentTrack = queue.currentTrack ? serializeTrack(queue.currentTrack) : null;
    const upcomingTracks = queue.tracks
      .toArray()
      .slice(0, 100)
      .map((track) => serializeTrack(track));

    if (!currentTrack && upcomingTracks.length === 0) {
      await this.clearPersistedSession(guildId, reason);
      return;
    }

    await this.playbackSessions.save({
      guildId,
      voiceChannelId: queue.channel.id,
      textChannelId: metadata.textChannelId,
      currentTrack,
      items: upcomingTracks,
      volume: queue.node.volume,
      repeatMode: queue.repeatMode,
      autoplayEnabled: queue.repeatMode === QueueRepeatMode.AUTOPLAY,
    });

    const runtime = this.getRuntimeState(guildId);
    runtime.lastSyncReason = reason;
    runtime.lastAutoRecoverBlockReason = null;
  }

  private async tryAutoRecoverSession(client: Client, session: StoredPlaybackSession, botUserId: string) {
    const autoResumeEnabled = await this.guildSettings.isResumeQueueEnabled(session.guildId);
    if (!autoResumeEnabled) {
      await this.clearPersistedSession(session.guildId, 'configDisabled', {
        lastAutoRecoverBlockReason: 'Recuperacao automatica desativada neste servidor.',
      });
      return;
    }

    const guild = await resolveGuild(client, session.guildId);
    if (!guild) {
      await this.clearPersistedSession(session.guildId, 'queueDelete', {
        lastAutoRecoverBlockReason: 'A guild da sessao salva nao esta mais disponivel. A sessao foi descartada.',
      });
      return;
    }

    const voiceChannel = await resolveVoiceChannel(guild, session.voiceChannelId);
    const validationFailure = await this.validateRecoveryChannel(guild, voiceChannel, true, session);
    if (validationFailure) {
      const runtime = this.getRuntimeState(session.guildId);
      runtime.lastAutoRecoverBlockReason = validationFailure;
      this.recordSessionSignal(
        session.guildId,
        { textChannelId: session.textChannelId },
        session.voiceChannelId,
        classifySessionSignalFromBlock(validationFailure),
        validationFailure,
      );
      return;
    }

    try {
      await this.executeRecovery({
        guildId: session.guildId,
        trigger: 'startup',
        voiceChannel: voiceChannel!,
        session,
        requestedById: botUserId,
        metadata: { textChannelId: session.textChannelId },
        auto: true,
        source: 'system',
        maxAttempts: MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
      });
    } catch (error) {
      logger.warn(
        {
          guildId: session.guildId,
          err: error,
        },
        'Playback session auto-recovery failed on startup',
      );
    }
  }

  private async executeRecovery(input: RecoveryExecutionInput): Promise<PlaybackRecoveryResult> {
    const runtime = this.getRuntimeState(input.guildId);
    runtime.lastAutoRecoverBlockReason = null;

    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < input.maxAttempts) {
      attempt += 1;
      if (input.auto && !this.tryStartAutomaticRecoveryWindow(input.guildId, input.trigger)) {
        const reason = `Recovery automatico abortado apos ${MAX_AUTOMATIC_RECOVERY_ATTEMPTS} tentativa(s) em ${Math.round(
          RECOVERY_WINDOW_MS / 1000,
        )}s.`;
        runtime.lastAutoRecoverBlockReason = reason;
        runtime.recovery.lastStatus = 'aborted';
        this.operationalTelemetry.recordRecoveryAborted({
          guildId: input.guildId,
          trigger: input.trigger,
          attempt: runtime.recovery.attemptsInWindow,
          reason,
          terminal: true,
        });
        throw new Error(reason);
      }

      runtime.recovery.active = true;
      runtime.recovery.lastTrigger = input.trigger;
      runtime.recovery.lastStatus = 'running';
      runtime.recovery.lastAttemptAt = new Date();

      this.operationalTelemetry.recordRecoveryStarted({
        guildId: input.guildId,
        trigger: input.trigger,
        attempt,
        channelId: input.voiceChannel.id,
        textChannelId: input.metadata.textChannelId,
        source: input.source ?? 'system',
        auto: input.auto,
      });

      const startedAt = Date.now();

      try {
        await this.resetQueueForRecovery(input.guildId);

        const recovery = await this.music.recoverPlaybackSession(
          input.voiceChannel,
          input.session,
          input.requestedById,
          input.metadata,
        );

        await this.syncQueue(recovery.queue, 'recover');

        runtime.recovery.active = false;
        runtime.recovery.lastStatus = 'success';
        runtime.recovery.lastDurationMs = Date.now() - startedAt;
        runtime.recovery.lastSuccessfulRecoveryAt = new Date();
        runtime.recovery.lastRecoveredTrackCount = recovery.recoveredTrackCount;
        runtime.recovery.lastSkippedTrackCount = recovery.skippedTrackCount;
        runtime.lastSyncReason = 'recover';
        runtime.lastAutoRecoverBlockReason = null;

        this.recordSessionSignal(
          input.guildId,
          input.metadata,
          input.voiceChannel.id,
          recovery.skippedTrackCount > 0 || !recovery.restoredCurrentTrack ? 'session_partial' : 'session_restored',
          recovery.skippedTrackCount > 0 || !recovery.restoredCurrentTrack
            ? `Recovery concluiu com ressalvas: ${recovery.recoveredTrackCount}/${recovery.requestedTrackCount} faixa(s) restaurada(s).`
            : `Recovery concluiu com ${recovery.recoveredTrackCount} faixa(s) restaurada(s).`,
          recovery.track,
        );

        this.operationalTelemetry.recordRecoverySucceeded({
          guildId: input.guildId,
          trigger: input.trigger,
          attempt,
          channelId: input.voiceChannel.id,
          textChannelId: input.metadata.textChannelId,
          source: input.source ?? 'system',
          auto: input.auto,
          durationMs: runtime.recovery.lastDurationMs,
          recoveredTrackCount: recovery.recoveredTrackCount,
          skippedTrackCount: recovery.skippedTrackCount,
        });

        logger.info(
          {
            guildId: input.guildId,
            trigger: input.trigger,
            attempt,
            recoveredTrackCount: recovery.recoveredTrackCount,
            skippedTrackCount: recovery.skippedTrackCount,
          },
          input.auto ? 'Playback recovery completed' : 'Playback session recovered manually',
        );

        return {
          session: input.session,
          requestedTrackCount: recovery.requestedTrackCount,
          recoveredTrackCount: recovery.recoveredTrackCount,
          skippedTrackCount: recovery.skippedTrackCount,
          restoredCurrentTrack: recovery.restoredCurrentTrack,
          restoredUpcomingTrackCount: recovery.restoredUpcomingTrackCount,
          volume: recovery.volume,
          repeatMode: recovery.repeatMode,
          autoplayEnabled: recovery.autoplayEnabled,
          sessionHealth: recovery.skippedTrackCount > 0 || !recovery.restoredCurrentTrack ? 'partial' : 'healthy',
          healthDetail:
            recovery.skippedTrackCount > 0 || !recovery.restoredCurrentTrack
              ? 'Parte da sessao voltou, mas nem todas as faixas salvas continuaram tocaveis.'
              : 'Sessao restaurada por completo com volume e repeticao reaplicados.',
          manualInterventionRequired: false,
          autoRecovered: input.auto,
          attemptCount: attempt,
        };
      } catch (error) {
        lastError = error;
        const classified = classifyQueueError(error);
        runtime.recovery.active = false;
        runtime.recovery.lastStatus = 'failed';
        runtime.recovery.lastDurationMs = Date.now() - startedAt;
        runtime.recovery.lastRecoveredTrackCount = 0;
        runtime.recovery.lastSkippedTrackCount = 0;

        this.operationalTelemetry.recordRecoveryFailed({
          guildId: input.guildId,
          trigger: input.trigger,
          attempt,
          channelId: input.voiceChannel.id,
          textChannelId: input.metadata.textChannelId,
          source: input.source ?? 'system',
          auto: input.auto,
          durationMs: runtime.recovery.lastDurationMs,
          code: classified.code,
          message: classified.message,
          terminal: classified.terminal || error instanceof PlaybackUnavailableError,
        });

        const isTerminal = classified.terminal || error instanceof PlaybackUnavailableError;
        if (isTerminal || attempt >= input.maxAttempts) {
          const reason = `Recovery ${isTerminal ? 'terminal' : 'esgotado'}: ${formatErrorMessage(error)}.`;
          runtime.lastAutoRecoverBlockReason = reason;
          runtime.recovery.lastStatus = isTerminal ? 'failed' : 'aborted';
          this.recordSessionSignal(
            input.guildId,
            input.metadata,
            input.voiceChannel.id,
            'session_broken',
            reason,
          );

          if (error instanceof PlaybackUnavailableError) {
            await this.clearPersistedSession(input.guildId, 'queueDelete', {
              lastAutoRecoverBlockReason: 'Nenhuma faixa salva continua tocavel. A sessao foi descartada.',
            });
          }

          this.operationalTelemetry.recordRecoveryAborted({
            guildId: input.guildId,
            trigger: input.trigger,
            attempt,
            reason,
            terminal: isTerminal || attempt >= input.maxAttempts,
          });
          throw error instanceof Error ? error : new Error(reason);
        }

        await sleep(RECOVERY_RETRY_DELAY_MS);
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Recovery nao concluiu com sucesso.');
  }

  private tryStartAutomaticRecoveryWindow(guildId: string, trigger: RecoveryTrigger) {
    const runtime = this.getRuntimeState(guildId);
    const now = Date.now();

    if (!runtime.recovery.windowStartedAt || now - runtime.recovery.windowStartedAt > RECOVERY_WINDOW_MS) {
      runtime.recovery.windowStartedAt = now;
      runtime.recovery.attemptsInWindow = 0;
    }

    if (runtime.recovery.attemptsInWindow >= MAX_AUTOMATIC_RECOVERY_ATTEMPTS) {
      runtime.recovery.lastTrigger = trigger;
      return false;
    }

    runtime.recovery.attemptsInWindow += 1;
    runtime.recovery.lastTrigger = trigger;
    return true;
  }

  private async resetQueueForRecovery(guildId: string) {
    const queue = this.player.nodes.get<QueueMetadata>(guildId);
    if (!queue) {
      return;
    }

    this.ignoredQueueDeletes.add(guildId);
    queue.delete();
  }

  private async buildRecoveryCandidate(guildId: string, queue?: GuildQueue<QueueMetadata> | null): Promise<RecoveryCandidate | null> {
    const persisted = await this.playbackSessions.get(guildId);
    const live = queue ? buildLiveSessionSnapshot(queue, persisted) : null;

    if (live) {
      return {
        session: live,
        source: 'live',
        voiceChannel: (queue?.channel as VoiceChannel | StageChannel | null) ?? null,
      };
    }

    if (!persisted) {
      return null;
    }

    return {
      session: persisted,
      source: 'persisted',
      voiceChannel: await resolveVoiceChannel(queue?.guild ?? null, persisted.voiceChannelId),
    };
  }

  private async validateRecoveryChannel(
    guild: Guild,
    voiceChannel: VoiceChannel | StageChannel | null,
    autoResumeEnabled: boolean,
    session: StoredPlaybackSession,
  ) {
    if (!voiceChannel) {
      if (autoResumeEnabled) {
        await this.clearPersistedSession(session.guildId, 'queueDelete', {
          lastAutoRecoverBlockReason: 'O canal de voz salvo nao existe mais. A sessao foi descartada.',
        });
      }
      return 'O canal de voz salvo nao existe mais ou nao esta acessivel.';
    }

    const botMember = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
    if (!botMember) {
      return 'Nao foi possivel validar o membro do bot nesta guild para recovery.';
    }

    const permissions = botMember.permissionsIn(voiceChannel);
    if (
      !permissions.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.Connect) ||
      !permissions.has(PermissionFlagsBits.Speak)
    ) {
      if (autoResumeEnabled) {
        await this.persistPendingSessionIfAllowed(session.guildId, session);
      }

      return 'O bot nao tem permissao de entrar e falar no canal de voz para recovery.';
    }

    const humanMembers = voiceChannel.members.filter((member) => !member.user.bot);
    if (humanMembers.size === 0) {
      if (autoResumeEnabled) {
        await this.persistPendingSessionIfAllowed(session.guildId, session);
      }

      return 'Sessao mantida pendente: nenhum usuario humano esta no canal de voz.';
    }

    return null;
  }

  private async persistPendingSessionIfAllowed(guildId: string, session: StoredPlaybackSession) {
    const autoResumeEnabled = await this.guildSettings.isResumeQueueEnabled(guildId);
    if (!autoResumeEnabled) {
      return;
    }

    await this.playbackSessions.save({
      guildId,
      voiceChannelId: session.voiceChannelId,
      textChannelId: session.textChannelId,
      currentTrack: session.currentTrack,
      items: session.items.map((item) => item.track),
      volume: session.volume,
      repeatMode: session.repeatMode,
      autoplayEnabled: session.autoplayEnabled,
    });
  }

  private async clearPersistedSession(
    guildId: string,
    reason: PlaybackSessionSyncReason,
    options: { lastAutoRecoverBlockReason?: string | null } = {},
  ) {
    if (!this.shuttingDown || reason === 'configDisabled' || reason === 'manualStop' || reason === 'manualLeave') {
      await this.playbackSessions.clear(guildId);
    }

    const runtime = this.getRuntimeState(guildId);
    runtime.lastSyncReason = reason;
    runtime.lastAutoRecoverBlockReason = options.lastAutoRecoverBlockReason ?? null;
  }

  private recordSessionSignal(
    guildId: string,
    metadata: QueueMetadata | { textChannelId: string } | null | undefined,
    channelId: string | null,
    type: 'session_pending' | 'session_restored' | 'session_partial' | 'session_broken',
    detail: string,
    track?: { url?: string; raw?: Record<string, unknown> | null } | null,
  ) {
    const route = this.music.inferTrackRoute?.(track ?? null) ?? inferTrackPlaybackRoute(track ?? null);
    this.operationalTelemetry.recordPlaybackSignal({
      guildId,
      type,
      channelId,
      textChannelId: metadata?.textChannelId ?? null,
      detail,
      provider: route.provider,
      pipeline: route.pipeline,
    });
  }
}

function assessSessionHealth(input: {
  state: PlaybackSessionState;
  session: StoredPlaybackSession | null;
  autoResumeEnabled: boolean;
  hasActiveQueue: boolean;
  liveItemCount: number;
  runtime: RuntimeState;
}): {
  health: PlaybackSessionHealth;
  detail: string;
  recoveryReady: boolean;
  manualInterventionRequired: boolean;
  stalePersistedSession: boolean;
} {
  const persistedItemCount = input.session ? Number(Boolean(input.session.currentTrack)) + input.session.items.length : 0;
  const stalePersistedSession = Boolean(
    input.session && Date.now() - input.session.updatedAt.getTime() > STALE_PENDING_SESSION_MS,
  );
  const blockReason = input.runtime.lastAutoRecoverBlockReason ?? null;
  const lastSkipped = input.runtime.recovery.lastSkippedTrackCount;
  const lastStatus = input.runtime.recovery.lastStatus;

  if (!input.autoResumeEnabled) {
    return {
      health: 'disabled',
      detail: input.session
        ? `Resume queue desativado com ${persistedItemCount} faixa(s) ainda salvas.`
        : 'Resume queue desativado neste servidor.',
      recoveryReady: false,
      manualInterventionRequired: false,
      stalePersistedSession,
    };
  }

  if (input.state === 'recovering') {
    return {
      health: 'recoverable',
      detail: 'Recovery em andamento para esta guild.',
      recoveryReady: false,
      manualInterventionRequired: false,
      stalePersistedSession,
    };
  }

  if (input.hasActiveQueue && lastStatus === 'success' && lastSkipped > 0) {
    return {
      health: 'partial',
      detail: `A sessao voltou a tocar, mas ${lastSkipped} faixa(s) ficaram de fora durante o recovery.`,
      recoveryReady: false,
      manualInterventionRequired: false,
      stalePersistedSession,
    };
  }

  if (input.hasActiveQueue) {
    return {
      health: 'healthy',
      detail: `Fila ao vivo com ${input.liveItemCount} faixa(s) rastreadas nesta guild.`,
      recoveryReady: false,
      manualInterventionRequired: false,
      stalePersistedSession,
    };
  }

  if (!input.session) {
    return {
      health: 'healthy',
      detail: 'Nenhuma sessao persistida pendente no momento.',
      recoveryReady: false,
      manualInterventionRequired: false,
      stalePersistedSession: false,
    };
  }

  if (persistedItemCount === 0) {
    return {
      health: 'broken',
      detail: 'A sessao persistida nao tem faixas validas para restaurar.',
      recoveryReady: false,
      manualInterventionRequired: true,
      stalePersistedSession,
    };
  }

  if (blockReason) {
    if (/nenhum usuario humano/iu.test(blockReason)) {
      return {
        health: 'recoverable',
        detail: `${blockReason}${stalePersistedSession ? ' A sessao salva ja esta antiga e merece revisao manual.' : ''}`,
        recoveryReady: false,
        manualInterventionRequired: false,
        stalePersistedSession,
      };
    }

    if (/permissao|nao tem permissao/iu.test(blockReason)) {
      return {
        health: 'recoverable',
        detail: `${blockReason}${stalePersistedSession ? ' A sessao tambem ja esta antiga.' : ''}`,
        recoveryReady: false,
        manualInterventionRequired: true,
        stalePersistedSession,
      };
    }

    return {
      health: 'broken',
      detail: `${blockReason}${stalePersistedSession ? ' A sessao tambem esta antiga.' : ''}`,
      recoveryReady: false,
      manualInterventionRequired: true,
      stalePersistedSession,
    };
  }

  if (lastStatus === 'failed' || lastStatus === 'aborted') {
    return {
      health: 'broken',
      detail: 'Existe uma sessao salva, mas o ultimo recovery falhou ou foi abortado.',
      recoveryReady: false,
      manualInterventionRequired: true,
      stalePersistedSession,
    };
  }

  return {
    health: stalePersistedSession ? 'recoverable' : 'healthy',
    detail: stalePersistedSession
      ? `Sessao pendente com ${persistedItemCount} faixa(s), mas salva ha mais de 24h.`
      : `Sessao persistida pronta para recover com ${persistedItemCount} faixa(s).`,
    recoveryReady: true,
    manualInterventionRequired: stalePersistedSession,
    stalePersistedSession,
  };
}

function classifySessionSignalFromBlock(blockReason: string) {
  if (/nenhum usuario humano/iu.test(blockReason)) {
    return 'session_pending' as const;
  }

  if (/permissao|nao tem permissao/iu.test(blockReason)) {
    return 'session_pending' as const;
  }

  return 'session_broken' as const;
}

function buildLiveSessionSnapshot(
  queue: GuildQueue<QueueMetadata>,
  persistedSession: StoredPlaybackSession | null,
): StoredPlaybackSession | null {
  const textChannelId = queue.metadata?.textChannelId ?? persistedSession?.textChannelId ?? null;
  const voiceChannelId = queue.channel?.id ?? persistedSession?.voiceChannelId ?? null;

  if (!textChannelId || !voiceChannelId) {
    return null;
  }

  const currentTrack = queue.currentTrack ? serializeTrack(queue.currentTrack) : null;
  const items = queue.tracks
    .toArray()
    .slice(0, 100)
    .map((track, index) => ({
      position: index + 1,
      track: serializeTrack(track),
    }));

  if (!currentTrack && items.length === 0) {
    return null;
  }

  return {
    guildId: queue.guild.id,
    voiceChannelId,
    textChannelId,
    currentTrack,
    items,
    volume: queue.node.volume,
    repeatMode: queue.repeatMode,
    autoplayEnabled: queue.repeatMode === QueueRepeatMode.AUTOPLAY,
    createdAt: persistedSession?.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

async function resolveGuild(client: Client, guildId: string) {
  return client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null));
}

async function resolveVoiceChannel(guild: Guild | null | undefined, channelId: string) {
  if (!guild) {
    return null;
  }

  const cached = guild.channels.cache.get(channelId);
  const channel = cached ?? (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !('isVoiceBased' in channel) || !channel.isVoiceBased()) {
    return null;
  }

  return channel as VoiceChannel | StageChannel;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'erro desconhecido';
}

function sleep(durationMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
