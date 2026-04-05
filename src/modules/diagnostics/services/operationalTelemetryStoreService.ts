import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { GuildOperationalSnapshot, OperationalIncident } from './operationalTelemetryService.js';

const DEFAULT_RECENT_INCIDENT_LIMIT = 25;
const MAX_INCIDENTS_PER_GUILD = 500;
const MAX_GLOBAL_RUNTIME_WARNINGS = 100;
const SQLITE_OFFSET_LIMIT = 1_000_000;

interface CountRow {
  total: number | bigint;
}

interface IdRow {
  id: string;
}

interface GuildIdRow {
  guildId: string | null;
}

interface OperationalIncidentRow {
  id: string;
  guildId: string | null;
  category: string;
  command: string | null;
  source: string | null;
  userId: string | null;
  channelId: string | null;
  textChannelId: string | null;
  type: string;
  stage: string | null;
  code: string | null;
  message: string;
  provider: string | null;
  pipeline: string | null;
  recoverable: boolean | null;
  terminal: boolean | null;
  trigger: string | null;
  attempt: number | null;
  auto: boolean | null;
  durationMs: number | null;
  commandStatus: string | null;
  errorKind: string | null;
  occurredAt: Date | string;
}

export interface PersistedOperationalIncidentInput {
  guildId?: string | null;
  category: OperationalIncident['category'] | 'runtime_warning';
  command?: string | null;
  source?: 'slash' | 'prefix' | 'dashboard' | 'system' | null;
  userId?: string | null;
  channelId?: string | null;
  textChannelId?: string | null;
  type: string;
  stage?: string | null;
  code?: string | null;
  message: string;
  provider?: string | null;
  pipeline?: string | null;
  recoverable?: boolean | null;
  terminal?: boolean | null;
  trigger?: string | null;
  attempt?: number | null;
  auto?: boolean | null;
  durationMs?: number | null;
  commandStatus?: 'ok' | 'error' | null;
  errorKind?: string | null;
  occurredAt?: Date;
}

export interface RuntimeWarningSnapshot {
  total: number;
  recent: OperationalIncident[];
}

export class OperationalTelemetryStoreService {
  private writeCount = 0;

  public constructor(private readonly prisma: PrismaClient) {}

  public async recordIncident(input: PersistedOperationalIncidentInput) {
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO "OperationalIncident" (
        "id",
        "guildId",
        "category",
        "command",
        "source",
        "userId",
        "channelId",
        "textChannelId",
        "type",
        "stage",
        "code",
        "message",
        "provider",
        "pipeline",
        "recoverable",
        "terminal",
        "trigger",
        "attempt",
        "auto",
        "durationMs",
        "commandStatus",
        "errorKind",
        "occurredAt"
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      randomUUID(),
      input.guildId ?? null,
      input.category,
      input.command ?? null,
      input.source ?? null,
      input.userId ?? null,
      input.channelId ?? null,
      input.textChannelId ?? null,
      input.type,
      input.stage ?? null,
      input.code ?? null,
      input.message,
      input.provider ?? null,
      input.pipeline ?? null,
      input.recoverable ?? null,
      input.terminal ?? null,
      input.trigger ?? null,
      input.attempt ?? null,
      input.auto ?? null,
      input.durationMs ?? null,
      input.commandStatus ?? null,
      input.errorKind ?? null,
      (input.occurredAt ?? new Date()).toISOString(),
    );

    this.writeCount += 1;
    if (this.writeCount % 20 === 0) {
      await this.pruneHistoricalIncidents();
    }
  }

  public async getGuildSnapshot(guildId: string, recentLimit = DEFAULT_RECENT_INCIDENT_LIMIT): Promise<GuildOperationalSnapshot> {
    const rows = await this.prisma.$queryRawUnsafe<OperationalIncidentRow[]>(
      `
      SELECT
        "id",
        "guildId",
        "category",
        "command",
        "source",
        "userId",
        "channelId",
        "textChannelId",
        "type",
        "stage",
        "code",
        "message",
        "provider",
        "pipeline",
        "recoverable",
        "terminal",
        "trigger",
        "attempt",
        "auto",
        "durationMs",
        "commandStatus",
        "errorKind",
        "occurredAt"
      FROM "OperationalIncident"
      WHERE "guildId" = ?
      ORDER BY "occurredAt" DESC
      LIMIT ?
      `,
      guildId,
      MAX_INCIDENTS_PER_GUILD,
    );

    return summarizeIncidents(guildId, rows, recentLimit);
  }

  public async getRuntimeWarningSnapshot(limit = 10): Promise<RuntimeWarningSnapshot> {
    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRawUnsafe<CountRow[]>(
        `
        SELECT COUNT(*) as total
        FROM "OperationalIncident"
        WHERE "category" = ?
        `,
        'runtime_warning',
      ),
      this.prisma.$queryRawUnsafe<OperationalIncidentRow[]>(
        `
        SELECT
          "id",
          "guildId",
          "category",
          "command",
          "source",
          "userId",
          "channelId",
          "textChannelId",
          "type",
          "stage",
          "code",
          "message",
          "provider",
          "pipeline",
          "recoverable",
          "terminal",
          "trigger",
          "attempt",
          "auto",
          "durationMs",
          "commandStatus",
          "errorKind",
          "occurredAt"
        FROM "OperationalIncident"
        WHERE "category" = ?
        ORDER BY "occurredAt" DESC
        LIMIT ?
        `,
        'runtime_warning',
        limit,
      ),
    ]);

    return {
      total: normalizeCount(countRows[0]?.total),
      recent: rows.map(mapIncidentRow),
    };
  }

  public async getRecentIncidents(limit = 10): Promise<OperationalIncident[]> {
    const rows = await this.prisma.$queryRawUnsafe<OperationalIncidentRow[]>(
      `
      SELECT
        "id",
        "guildId",
        "category",
        "command",
        "source",
        "userId",
        "channelId",
        "textChannelId",
        "type",
        "stage",
        "code",
        "message",
        "provider",
        "pipeline",
        "recoverable",
        "terminal",
        "trigger",
        "attempt",
        "auto",
        "durationMs",
        "commandStatus",
        "errorKind",
        "occurredAt"
      FROM "OperationalIncident"
      ORDER BY "occurredAt" DESC
      LIMIT ?
      `,
      limit,
    );

    return rows.map(mapIncidentRow);
  }

  private async pruneHistoricalIncidents() {
    const guilds = await this.prisma.$queryRawUnsafe<GuildIdRow[]>(
      `
      SELECT DISTINCT "guildId" as "guildId"
      FROM "OperationalIncident"
      WHERE "guildId" IS NOT NULL
      `,
    );

    for (const guild of guilds) {
      if (!guild.guildId) {
        continue;
      }

      const oldRows = await this.prisma.$queryRawUnsafe<IdRow[]>(
        `
        SELECT "id"
        FROM "OperationalIncident"
        WHERE "guildId" = ?
        ORDER BY "occurredAt" DESC
        LIMIT ? OFFSET ?
        `,
        guild.guildId,
        SQLITE_OFFSET_LIMIT,
        MAX_INCIDENTS_PER_GUILD,
      );

      await this.deleteRowsById(oldRows);
    }

    const oldWarnings = await this.prisma.$queryRawUnsafe<IdRow[]>(
      `
      SELECT "id"
      FROM "OperationalIncident"
      WHERE "category" = ?
      ORDER BY "occurredAt" DESC
      LIMIT ? OFFSET ?
      `,
      'runtime_warning',
      SQLITE_OFFSET_LIMIT,
      MAX_GLOBAL_RUNTIME_WARNINGS,
    );

    await this.deleteRowsById(oldWarnings);
  }

  private async deleteRowsById(rows: IdRow[]) {
    if (rows.length === 0) {
      return;
    }

    const placeholders = rows.map(() => '?').join(', ');
    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM "OperationalIncident"
      WHERE "id" IN (${placeholders})
      `,
      ...rows.map((row) => row.id),
    );
  }
}

function summarizeIncidents(guildId: string, rows: OperationalIncidentRow[], recentLimit: number): GuildOperationalSnapshot {
  const incidents = rows.map(mapIncidentRow);
  const byCommand: GuildOperationalSnapshot['commands']['byCommand'] = {};
  const byCode: GuildOperationalSnapshot['failures']['byCode'] = {};
  const playbackSignals: Record<string, number> = {};
  let commandTotal = 0;
  let commandFailed = 0;
  let failureTotal = 0;
  let reconnectsStarted = 0;
  let reconnectsCompleted = 0;
  let reconnectsFailed = 0;
  let recoveriesStarted = 0;
  let recoveriesSucceeded = 0;
  let recoveriesFailed = 0;
  let recoveriesAborted = 0;
  let recoveriesRetried = 0;
  let recoveryDurationSum = 0;
  let recoveryDurationCount = 0;
  let lastCommand: GuildOperationalSnapshot['commands']['last'] = null;
  let lastFailure: GuildOperationalSnapshot['failures']['last'] = null;
  let lastRecovery: GuildOperationalSnapshot['recoveries']['last'] = null;
  let activeRecovery: GuildOperationalSnapshot['recoveries']['active'] = null;

  for (const incident of incidents) {
    if (incident.category === 'command') {
      commandTotal += 1;
      const command = incident.command ?? 'unknown';
      const entry = byCommand[command] ?? { success: 0, error: 0 };
      const status = incident.type === 'command_error' ? 'error' : 'ok';
      if (status === 'error') {
        commandFailed += 1;
        entry.error += 1;
      } else {
        entry.success += 1;
      }
      byCommand[command] = entry;

      if (!lastCommand) {
        lastCommand = {
          guildId,
          userId: incident.userId ?? 'unknown',
          command,
          source: (incident.source as 'slash' | 'prefix') ?? 'slash',
          status,
          durationMs: incident.durationMs ?? 0,
          errorKind: incident.errorKind ?? undefined,
        };
      }
      continue;
    }

    if (incident.category === 'playback') {
      playbackSignals[incident.type] = (playbackSignals[incident.type] ?? 0) + 1;
      if (incident.type === 'voice_connected') {
        reconnectsCompleted += 1;
      }
      continue;
    }

    if (incident.category === 'failure') {
      failureTotal += 1;
      if (incident.code) {
        byCode[incident.code] = (byCode[incident.code] ?? 0) + 1;
      }
      if (!lastFailure) {
        lastFailure = incident;
      }
      if (['voice_connection_timeout', 'voice_connection_destroyed', 'voice_disconnected'].includes(incident.code ?? '')) {
        reconnectsStarted += 1;
      }
      continue;
    }

    if (incident.category === 'recovery') {
      if (incident.type === 'recovery_started') {
        recoveriesStarted += 1;
        if ((incident.attempt ?? 1) > 1) {
          recoveriesRetried += 1;
        }
        if (!activeRecovery) {
          activeRecovery = {
            trigger: (incident.trigger as NonNullable<GuildOperationalSnapshot['recoveries']['active']>['trigger']) ?? 'manual',
            attempt: incident.attempt ?? 1,
            startedAt: incident.occurredAt,
            auto: incident.auto ?? false,
          };
        }
      } else if (incident.type === 'recovery_succeeded') {
        recoveriesSucceeded += 1;
        activeRecovery = null;
        if (typeof incident.durationMs === 'number') {
          recoveryDurationSum += incident.durationMs;
          recoveryDurationCount += 1;
        }
        lastRecovery = lastRecovery ?? incident;
      } else if (incident.type === 'recovery_failed') {
        recoveriesFailed += 1;
        reconnectsFailed += 1;
        activeRecovery = null;
        lastRecovery = lastRecovery ?? incident;
      } else if (incident.type === 'recovery_aborted') {
        recoveriesAborted += 1;
        activeRecovery = null;
        lastRecovery = lastRecovery ?? incident;
      }
    }
  }

  if (incidents[0]?.category === 'recovery' && incidents[0]?.type !== 'recovery_started') {
    activeRecovery = null;
  }

  return {
    guildId,
    commands: {
      total: commandTotal,
      failed: commandFailed,
      byCommand,
      last: lastCommand,
    },
    failures: {
      total: failureTotal,
      byCode,
      last: lastFailure,
    },
    playbackSignals,
    reconnects: {
      started: reconnectsStarted,
      completed: reconnectsCompleted,
      failed: reconnectsFailed,
    },
    recoveries: {
      started: recoveriesStarted,
      succeeded: recoveriesSucceeded,
      failed: recoveriesFailed,
      aborted: recoveriesAborted,
      retried: recoveriesRetried,
      averageDurationMs: recoveryDurationCount > 0 ? Math.round(recoveryDurationSum / recoveryDurationCount) : null,
      last: lastRecovery,
      active: activeRecovery,
    },
    recentIncidents: incidents.slice(0, recentLimit),
  };
}

function mapIncidentRow(row: OperationalIncidentRow): OperationalIncident {
  return {
    occurredAt: normalizeDate(row.occurredAt),
    category: row.category as OperationalIncident['category'],
    guildId: row.guildId ?? '',
    command: row.command ?? null,
    source: (row.source as OperationalIncident['source']) ?? undefined,
    userId: row.userId ?? null,
    channelId: row.channelId ?? null,
    textChannelId: row.textChannelId ?? null,
    type: row.type,
    stage: (row.stage as OperationalIncident['stage']) ?? undefined,
    code: (row.code as OperationalIncident['code']) ?? undefined,
    message: row.message,
    provider: (row.provider as OperationalIncident['provider']) ?? undefined,
    pipeline: (row.pipeline as OperationalIncident['pipeline']) ?? undefined,
    recoverable: row.recoverable ?? undefined,
    terminal: row.terminal ?? undefined,
    trigger: (row.trigger as OperationalIncident['trigger']) ?? undefined,
    attempt: row.attempt ?? undefined,
    durationMs: row.durationMs ?? undefined,
    auto: row.auto ?? undefined,
    commandStatus: (row.commandStatus as OperationalIncident['commandStatus']) ?? undefined,
    errorKind: row.errorKind ?? undefined,
  };
}

function normalizeDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function normalizeCount(value: number | bigint | undefined) {
  if (typeof value === 'bigint') {
    return Number(value);
  }

  return value ?? 0;
}
