import { describe, expect, it } from 'vitest';
import { OperationalTelemetryService } from '../../src/modules/diagnostics/services/operationalTelemetryService.js';

describe('operational telemetry service', () => {
  it('aggregates commands, failures and recoveries per guild', () => {
    const service = new OperationalTelemetryService();

    service.recordCommandExecution({
      guildId: 'guild-1',
      userId: 'user-1',
      command: 'play',
      source: 'slash',
      status: 'ok',
      durationMs: 1400,
    });

    service.recordCommandExecution({
      guildId: 'guild-1',
      userId: 'user-1',
      command: 'play',
      source: 'slash',
      status: 'error',
      durationMs: 200,
      errorKind: 'dependency',
    });

    service.recordPlaybackSignal({
      guildId: 'guild-1',
      type: 'play_request',
      channelId: 'voice-1',
      textChannelId: 'text-1',
      detail: 'slash | queue | YouTube | youtube/youtube-dl | native | 1 faixa(s)',
      provider: 'youtube',
      pipeline: 'youtube-dl',
    });

    service.recordFailure({
      guildId: 'guild-1',
      channelId: 'voice-1',
      textChannelId: 'text-1',
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

    service.recordRecoveryStarted({
      guildId: 'guild-1',
      trigger: 'player_error',
      attempt: 1,
      channelId: 'voice-1',
      textChannelId: 'text-1',
      source: 'system',
      auto: true,
    });

    service.recordRecoverySucceeded({
      guildId: 'guild-1',
      trigger: 'player_error',
      attempt: 1,
      channelId: 'voice-1',
      textChannelId: 'text-1',
      source: 'system',
      auto: true,
      durationMs: 2300,
      recoveredTrackCount: 2,
      skippedTrackCount: 1,
    });

    const snapshot = service.getGuildSnapshot('guild-1');

    expect(snapshot.commands.total).toBe(2);
    expect(snapshot.commands.failed).toBe(1);
    expect(snapshot.commands.byCommand.play).toEqual({ success: 1, error: 1 });
    expect(snapshot.failures.total).toBe(1);
    expect(snapshot.failures.byCode.stream_unavailable).toBe(1);
    expect(snapshot.playbackSignals.play_request).toBe(1);
    expect(snapshot.recoveries.started).toBe(1);
    expect(snapshot.recoveries.succeeded).toBe(1);
    expect(snapshot.recoveries.averageDurationMs).toBe(2300);
    const lastPlayRequest = snapshot.recentIncidents.find((incident) => incident.category === 'playback' && incident.type === 'play_request');
    expect(lastPlayRequest?.provider).toBe('youtube');
    expect(lastPlayRequest?.pipeline).toBe('youtube-dl');
    expect(snapshot.recentIncidents[0]?.category).toBe('recovery');
  });

  it('keeps recent incidents bounded to avoid unbounded growth', () => {
    const service = new OperationalTelemetryService();

    for (let index = 0; index < 40; index += 1) {
      service.recordFailure({
        guildId: 'guild-2',
        stage: 'queue',
        code: 'queue_runtime_error',
        message: `failure-${index}`,
        provider: 'unknown',
        pipeline: 'unknown',
        recoverable: false,
        terminal: false,
      });
    }

    const snapshot = service.getGuildSnapshot('guild-2');
    expect(snapshot.recentIncidents).toHaveLength(25);
    expect(snapshot.recentIncidents[0]?.message).toBe('failure-39');
    expect(snapshot.recentIncidents.at(-1)?.message).toBe('failure-15');
  });
});
