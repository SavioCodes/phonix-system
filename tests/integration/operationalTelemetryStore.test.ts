import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OperationalTelemetryService } from '../../src/modules/diagnostics/services/operationalTelemetryService.js';
import { OperationalTelemetryStoreService } from '../../src/modules/diagnostics/services/operationalTelemetryStoreService.js';
import { cleanupSqliteTestDatabase, createPreparedSqliteTestDatabase } from '../support/sqliteTestHarness.js';

describe('operational telemetry persistence integration', () => {
  let prisma: PrismaClient | undefined;
  let tempDir: string;

  beforeEach(async () => {
    const database = await createPreparedSqliteTestDatabase('phonix-ops-');
    tempDir = database.tempDir;
    prisma = database.prismaClient;
  });

  afterEach(async () => {
    await cleanupSqliteTestDatabase(prisma, tempDir);
    prisma = undefined;
  });

  it('persists guild operational incidents and rebuilds history after a fresh service instance', async () => {
    const store = new OperationalTelemetryStoreService(prisma!);
    const telemetry = new OperationalTelemetryService(store);

    telemetry.recordCommandExecution({
      guildId: 'guild-1',
      userId: 'user-1',
      command: 'play',
      source: 'slash',
      status: 'ok',
      durationMs: 900,
    });
    telemetry.recordFailure({
      guildId: 'guild-1',
      command: 'play',
      source: 'slash',
      stage: 'stream',
      code: 'stream_unavailable',
      message: 'Could not extract stream for this track',
      provider: 'youtube',
      pipeline: 'youtube-dl',
      recoverable: true,
      terminal: false,
    });
    telemetry.recordRecoveryStarted({
      guildId: 'guild-1',
      trigger: 'player_error',
      attempt: 1,
      source: 'system',
      auto: true,
    });
    telemetry.recordRecoverySucceeded({
      guildId: 'guild-1',
      trigger: 'player_error',
      attempt: 1,
      source: 'system',
      auto: true,
      durationMs: 1800,
      recoveredTrackCount: 1,
      skippedTrackCount: 0,
    });

    await telemetry.flushPersistence();

    const freshStore = new OperationalTelemetryStoreService(prisma!);
    const snapshot = await freshStore.getGuildSnapshot('guild-1');

    expect(snapshot.commands.total).toBe(1);
    expect(snapshot.failures.total).toBe(1);
    expect(snapshot.failures.byCode.stream_unavailable).toBe(1);
    expect(snapshot.recoveries.started).toBe(1);
    expect(snapshot.recoveries.succeeded).toBe(1);
    expect(snapshot.recoveries.averageDurationMs).toBe(1800);
  }, 20_000);

  it('persists runtime warnings for diagnostics after restart', async () => {
    const store = new OperationalTelemetryStoreService(prisma!);
    const telemetry = new OperationalTelemetryService(store);

    telemetry.recordRuntimeWarning({
      name: 'DeprecationWarning',
      code: 'DEP0040',
      message: 'The `punycode` module is deprecated.',
    });

    await telemetry.flushPersistence();

    const warnings = await store.getRuntimeWarningSnapshot(5);
    expect(warnings.total).toBe(1);
    expect(warnings.recent[0]?.code).toBe('DEP0040');
  }, 20_000);
});
