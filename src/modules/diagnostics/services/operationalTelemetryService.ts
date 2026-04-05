import type {
  PlaybackFailureCode,
  PlaybackFailureStage,
  PlaybackPipeline,
  PlaybackProvider,
  RecoveryTrigger,
} from '../../music/playbackFaults.js';
import type { OperationalTelemetryStoreService } from './operationalTelemetryStoreService.js';
import { logger } from '../../../core/logging/logger.js';

const MAX_RECENT_EVENTS = 25;

export interface CommandExecutionTelemetryInput {
  guildId: string;
  userId: string;
  command: string;
  source: 'slash' | 'prefix';
  status: 'ok' | 'error';
  durationMs: number;
  errorKind?: string;
}

export interface OperationalFailureTelemetryInput {
  guildId: string;
  channelId?: string | null;
  textChannelId?: string | null;
  userId?: string | null;
  command?: string | null;
  source?: 'slash' | 'prefix' | 'dashboard' | 'system';
  stage: PlaybackFailureStage;
  code: PlaybackFailureCode;
  message: string;
  provider: PlaybackProvider;
  pipeline: PlaybackPipeline;
  recoverable: boolean;
  terminal: boolean;
}

export interface RecoveryAttemptStartedInput {
  guildId: string;
  trigger: RecoveryTrigger;
  attempt: number;
  channelId?: string | null;
  textChannelId?: string | null;
  command?: string | null;
  source?: 'slash' | 'prefix' | 'dashboard' | 'system';
  auto: boolean;
}

export interface RecoveryAttemptCompletedInput extends RecoveryAttemptStartedInput {
  durationMs: number;
  recoveredTrackCount: number;
  skippedTrackCount: number;
}

export interface RecoveryAttemptFailedInput extends RecoveryAttemptStartedInput {
  durationMs: number;
  code: PlaybackFailureCode;
  message: string;
  terminal: boolean;
}

export interface RecoveryAttemptAbortedInput {
  guildId: string;
  trigger: RecoveryTrigger;
  attempt: number;
  reason: string;
  terminal: boolean;
}

export interface PlaybackSignalInput {
  guildId: string;
  type:
    | 'play_request'
    | 'player_start'
    | 'player_finish'
    | 'player_pause'
    | 'player_resume'
    | 'player_skip'
    | 'queue_delete'
    | 'queue_create'
    | 'voice_connected'
    | 'voice_connection_destroyed'
    | 'voice_disconnected'
    | 'voice_empty_channel'
    | 'volume_change'
    | 'leave'
    | 'session_pending'
    | 'session_restored'
    | 'session_partial'
    | 'session_broken';
  channelId?: string | null;
  textChannelId?: string | null;
  detail?: string;
  provider?: PlaybackProvider;
  pipeline?: PlaybackPipeline;
}

export interface RuntimeWarningTelemetryInput {
  code?: string;
  name: string;
  message: string;
  detail?: string;
}

export interface OperationalIncident {
  occurredAt: Date;
  category: 'command' | 'playback' | 'failure' | 'recovery' | 'runtime_warning';
  guildId: string;
  command?: string | null;
  source?: 'slash' | 'prefix' | 'dashboard' | 'system';
  userId?: string | null;
  channelId?: string | null;
  textChannelId?: string | null;
  type: string;
  stage?: PlaybackFailureStage;
  code?: PlaybackFailureCode | string;
  message: string;
  provider?: PlaybackProvider;
  pipeline?: PlaybackPipeline;
  recoverable?: boolean;
  terminal?: boolean;
  trigger?: RecoveryTrigger;
  attempt?: number;
  durationMs?: number;
  auto?: boolean;
  commandStatus?: 'ok' | 'error';
  errorKind?: string;
}

export interface GuildOperationalSnapshot {
  guildId: string;
  commands: {
    total: number;
    failed: number;
    byCommand: Record<string, { success: number; error: number }>;
    last: CommandExecutionTelemetryInput | null;
  };
  failures: {
    total: number;
    byCode: Record<string, number>;
    last: OperationalIncident | null;
  };
  playbackSignals: Record<string, number>;
  reconnects: {
    started: number;
    completed: number;
    failed: number;
  };
  recoveries: {
    started: number;
    succeeded: number;
    failed: number;
    aborted: number;
    retried: number;
    averageDurationMs: number | null;
    last: OperationalIncident | null;
    active: {
      trigger: RecoveryTrigger;
      attempt: number;
      startedAt: Date;
      auto: boolean;
    } | null;
  };
  recentIncidents: OperationalIncident[];
}

interface GuildOperationalState {
  commands: GuildOperationalSnapshot['commands'];
  failures: GuildOperationalSnapshot['failures'];
  playbackSignals: Record<string, number>;
  reconnects: GuildOperationalSnapshot['reconnects'];
  recoveries: GuildOperationalSnapshot['recoveries'] & {
    totalDurationMs: number;
  };
  recentIncidents: OperationalIncident[];
}

export class OperationalTelemetryService {
  private readonly state = new Map<string, GuildOperationalState>();
  private readonly pendingWrites = new Set<Promise<void>>();

  public constructor(private readonly store?: OperationalTelemetryStoreService) {}

  public recordCommandExecution(input: CommandExecutionTelemetryInput) {
    const guild = this.getState(input.guildId);
    const perCommand = guild.commands.byCommand[input.command] ?? { success: 0, error: 0 };

    guild.commands.total += 1;
    guild.commands.last = input;

    if (input.status === 'ok') {
      perCommand.success += 1;
    } else {
      guild.commands.failed += 1;
      perCommand.error += 1;
    }

    guild.commands.byCommand[input.command] = perCommand;

    const incident = this.pushIncident(input.guildId, {
      category: 'command',
      guildId: input.guildId,
      command: input.command,
      source: input.source,
      userId: input.userId,
      type: input.status === 'ok' ? 'command_ok' : 'command_error',
      message:
        input.status === 'ok'
          ? `Comando ${input.command} executado com sucesso.`
          : `Comando ${input.command} falhou com ${input.errorKind ?? 'erro desconhecido'}.`,
      durationMs: input.durationMs,
      commandStatus: input.status,
      errorKind: input.errorKind,
    });

    this.persistIncident(incident);
  }

  public recordPlaybackSignal(input: PlaybackSignalInput) {
    const guild = this.getState(input.guildId);
    guild.playbackSignals[input.type] = (guild.playbackSignals[input.type] ?? 0) + 1;

    if (input.type === 'voice_connected') {
      guild.reconnects.completed += 1;
    }

    const incident = this.pushIncident(input.guildId, {
      category: 'playback',
      guildId: input.guildId,
      channelId: input.channelId ?? null,
      textChannelId: input.textChannelId ?? null,
      type: input.type,
      message: input.detail ?? 'Evento de playback registrado.',
      provider: input.provider,
      pipeline: input.pipeline,
    });

    this.persistIncident(incident);
  }

  public recordFailure(input: OperationalFailureTelemetryInput) {
    const guild = this.getState(input.guildId);
    guild.failures.total += 1;
    guild.failures.byCode[input.code] = (guild.failures.byCode[input.code] ?? 0) + 1;

    const incident = this.pushIncident(input.guildId, {
      category: 'failure',
      guildId: input.guildId,
      command: input.command ?? this.getLastCommand(input.guildId)?.command ?? null,
      source: input.source ?? this.getLastCommand(input.guildId)?.source ?? 'system',
      userId: input.userId ?? this.getLastCommand(input.guildId)?.userId ?? null,
      channelId: input.channelId ?? null,
      textChannelId: input.textChannelId ?? null,
      type: 'playback_failure',
      stage: input.stage,
      code: input.code,
      message: input.message,
      provider: input.provider,
      pipeline: input.pipeline,
      recoverable: input.recoverable,
      terminal: input.terminal,
    });

    guild.failures.last = incident;

    if (input.code === 'voice_connection_timeout' || input.code === 'voice_connection_destroyed' || input.code === 'voice_disconnected') {
      guild.reconnects.started += 1;
    }

    this.persistIncident(incident);
  }

  public recordRecoveryStarted(input: RecoveryAttemptStartedInput) {
    const guild = this.getState(input.guildId);
    guild.recoveries.started += 1;
    if (input.attempt > 1) {
      guild.recoveries.retried += 1;
    }

    guild.recoveries.active = {
      trigger: input.trigger,
      attempt: input.attempt,
      startedAt: new Date(),
      auto: input.auto,
    };

    const incident = this.pushIncident(input.guildId, {
      category: 'recovery',
      guildId: input.guildId,
      command: input.command ?? this.getLastCommand(input.guildId)?.command ?? null,
      source: input.source ?? 'system',
      channelId: input.channelId ?? null,
      textChannelId: input.textChannelId ?? null,
      type: 'recovery_started',
      message: `Recovery ${input.auto ? 'automatico' : 'manual'} iniciado via ${input.trigger}.`,
      trigger: input.trigger,
      attempt: input.attempt,
      auto: input.auto,
    });

    this.persistIncident(incident);
  }

  public recordRecoverySucceeded(input: RecoveryAttemptCompletedInput) {
    const guild = this.getState(input.guildId);
    guild.recoveries.succeeded += 1;
    guild.recoveries.totalDurationMs += input.durationMs;
    guild.recoveries.active = null;

    const incident = this.pushIncident(input.guildId, {
      category: 'recovery',
      guildId: input.guildId,
      command: input.command ?? this.getLastCommand(input.guildId)?.command ?? null,
      source: input.source ?? 'system',
      channelId: input.channelId ?? null,
      textChannelId: input.textChannelId ?? null,
      type: 'recovery_succeeded',
      message: `Recovery concluido em ${input.durationMs}ms com ${input.recoveredTrackCount} faixa(s) restaurada(s) e ${input.skippedTrackCount} ignorada(s).`,
      trigger: input.trigger,
      attempt: input.attempt,
      durationMs: input.durationMs,
      auto: input.auto,
    });

    guild.recoveries.last = incident;
    this.persistIncident(incident);
  }

  public recordRecoveryFailed(input: RecoveryAttemptFailedInput) {
    const guild = this.getState(input.guildId);
    guild.recoveries.failed += 1;
    guild.recoveries.active = null;

    if (input.trigger === 'queue_error' || input.trigger === 'connection_destroyed' || input.trigger === 'disconnect') {
      guild.reconnects.failed += 1;
    }

    const incident = this.pushIncident(input.guildId, {
      category: 'recovery',
      guildId: input.guildId,
      command: input.command ?? this.getLastCommand(input.guildId)?.command ?? null,
      source: input.source ?? 'system',
      channelId: input.channelId ?? null,
      textChannelId: input.textChannelId ?? null,
      type: 'recovery_failed',
      code: input.code,
      stage: 'recovery',
      message: `Recovery falhou em ${input.durationMs}ms: ${input.message}`,
      terminal: input.terminal,
      trigger: input.trigger,
      attempt: input.attempt,
      durationMs: input.durationMs,
      auto: input.auto,
    });

    guild.recoveries.last = incident;
    this.persistIncident(incident);
  }

  public recordRecoveryAborted(input: RecoveryAttemptAbortedInput) {
    const guild = this.getState(input.guildId);
    guild.recoveries.aborted += 1;
    guild.recoveries.active = null;

    const incident = this.pushIncident(input.guildId, {
      category: 'recovery',
      guildId: input.guildId,
      type: 'recovery_aborted',
      stage: 'recovery',
      code: input.terminal ? 'recovery_exhausted' : 'recovery_aborted',
      message: input.reason,
      terminal: input.terminal,
      trigger: input.trigger,
      attempt: input.attempt,
    });

    guild.recoveries.last = incident;
    this.persistIncident(incident);
  }

  public recordRuntimeWarning(input: RuntimeWarningTelemetryInput) {
    const incident: OperationalIncident = {
      occurredAt: new Date(),
      category: 'runtime_warning',
      guildId: '',
      type: input.name,
      code: input.code,
      message: input.message,
      source: 'system',
      command: null,
      userId: null,
      channelId: null,
      textChannelId: null,
    };

    if (input.detail) {
      incident.message = `${incident.message} ${input.detail}`;
    }

    this.persistIncident(incident);
  }

  public getGuildSnapshot(guildId: string): GuildOperationalSnapshot {
    const guild = this.getState(guildId);
    return {
      guildId,
      commands: {
        ...guild.commands,
        byCommand: { ...guild.commands.byCommand },
      },
      failures: {
        ...guild.failures,
        byCode: { ...guild.failures.byCode },
      },
      playbackSignals: { ...guild.playbackSignals },
      reconnects: { ...guild.reconnects },
      recoveries: {
        started: guild.recoveries.started,
        succeeded: guild.recoveries.succeeded,
        failed: guild.recoveries.failed,
        aborted: guild.recoveries.aborted,
        retried: guild.recoveries.retried,
        averageDurationMs:
          guild.recoveries.succeeded > 0 ? Math.round(guild.recoveries.totalDurationMs / guild.recoveries.succeeded) : null,
        last: guild.recoveries.last,
        active: guild.recoveries.active,
      },
      recentIncidents: [...guild.recentIncidents],
    };
  }

  public async getGuildSnapshotWithHistory(guildId: string): Promise<GuildOperationalSnapshot> {
    if (!this.store) {
      return this.getGuildSnapshot(guildId);
    }

    const persisted = await this.store.getGuildSnapshot(guildId);
    const live = this.getGuildSnapshot(guildId);

    return {
      ...persisted,
      recoveries: {
        ...persisted.recoveries,
        active: live.recoveries.active ?? persisted.recoveries.active,
      },
    };
  }

  public async flushPersistence() {
    await Promise.all([...this.pendingWrites]);
  }

  private getLastCommand(guildId: string) {
    return this.getState(guildId).commands.last;
  }

  private getState(guildId: string): GuildOperationalState {
    const existing = this.state.get(guildId);
    if (existing) {
      return existing;
    }

    const created: GuildOperationalState = {
      commands: {
        total: 0,
        failed: 0,
        byCommand: {},
        last: null,
      },
      failures: {
        total: 0,
        byCode: {},
        last: null,
      },
      playbackSignals: {},
      reconnects: {
        started: 0,
        completed: 0,
        failed: 0,
      },
      recoveries: {
        started: 0,
        succeeded: 0,
        failed: 0,
        aborted: 0,
        retried: 0,
        averageDurationMs: null,
        totalDurationMs: 0,
        last: null,
        active: null,
      },
      recentIncidents: [],
    };

    this.state.set(guildId, created);
    return created;
  }

  private pushIncident(guildId: string, incident: Omit<OperationalIncident, 'occurredAt'>) {
    const guild = this.getState(guildId);
    const entry: OperationalIncident = {
      occurredAt: new Date(),
      ...incident,
    };

    guild.recentIncidents.unshift(entry);
    if (guild.recentIncidents.length > MAX_RECENT_EVENTS) {
      guild.recentIncidents.length = MAX_RECENT_EVENTS;
    }

    return entry;
  }

  private persistIncident(incident: OperationalIncident) {
    if (!this.store) {
      return;
    }

    const write = this.store.recordIncident({
      guildId: incident.guildId || null,
      category: incident.category,
      command: incident.command ?? null,
      source: incident.source ?? null,
      userId: incident.userId ?? null,
      channelId: incident.channelId ?? null,
      textChannelId: incident.textChannelId ?? null,
      type: incident.type,
      stage: incident.stage ?? null,
      code: incident.code ?? null,
      message: incident.message,
      provider: incident.provider ?? null,
      pipeline: incident.pipeline ?? null,
      recoverable: incident.recoverable ?? null,
      terminal: incident.terminal ?? null,
      trigger: incident.trigger ?? null,
      attempt: incident.attempt ?? null,
      auto: incident.auto ?? null,
      durationMs: incident.durationMs ?? null,
      commandStatus: incident.commandStatus ?? null,
      errorKind: incident.errorKind ?? null,
      occurredAt: incident.occurredAt,
    })
      .catch((error) => {
        logger.warn({ err: error, category: incident.category, guildId: incident.guildId || null }, 'Operational incident persistence failed');
      })
      .finally(() => {
        this.pendingWrites.delete(write);
      });

    this.pendingWrites.add(write);
  }
}
