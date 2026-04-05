import { EventEmitter } from 'node:events';
import { GuildQueueEvent } from 'discord-player';
import { describe, expect, it, vi } from 'vitest';
import { registerClientEvents } from '../../src/app/register-client-events.js';
import { OperationalTelemetryService } from '../../src/modules/diagnostics/services/operationalTelemetryService.js';

describe('voice operations smoke', () => {
  it('captures a normal voice lifecycle with actionable guild telemetry', async () => {
    const client = new EventEmitter();
    const player = new EventEmitter() as EventEmitter & {
      events: EventEmitter;
      handleVoiceState: () => void;
    };
    player.events = new EventEmitter();
    player.handleVoiceState = vi.fn();

    const history = {
      record: vi.fn().mockResolvedValue(undefined),
    };
    const operationalTelemetry = new OperationalTelemetryService();

    registerClientEvents(client as never, {
      player,
      playbackSessionManager: {
        handleRuntimeFault: vi.fn().mockResolvedValue(undefined),
      },
      operationalTelemetry,
      history,
      ffmpeg: {
        available: true,
        detail: 'ffmpeg ok',
      },
    } as never);

    const queue = {
      guild: { id: 'guild-smoke' },
      channel: { id: 'voice-1' },
      metadata: { textChannelId: 'text-1' },
      currentTrack: {
        title: 'Track A',
        url: 'https://youtube.com/watch?v=track-a',
        author: 'Artist A',
        thumbnail: 'https://img.test/a.jpg',
        duration: '3:00',
        raw: { source: 'youtube' },
        serialize: () => ({ id: 'track-a' }),
        requestedBy: { id: 'user-1', bot: false },
      },
      isPlaying: () => true,
    };

    player.events.emit(GuildQueueEvent.Connection, queue);
    player.events.emit(GuildQueueEvent.PlayerStart, queue, queue.currentTrack);
    player.events.emit(GuildQueueEvent.PlayerPause, queue);
    player.events.emit(GuildQueueEvent.PlayerResume, queue);
    player.events.emit(GuildQueueEvent.PlayerSkip, queue, queue.currentTrack, 'manual', 'skip');
    player.events.emit(GuildQueueEvent.VolumeChange, queue, 50, 80);
    player.events.emit(GuildQueueEvent.QueueDelete, queue);
    await Promise.resolve();

    const snapshot = operationalTelemetry.getGuildSnapshot('guild-smoke');

    expect(snapshot.playbackSignals.voice_connected).toBe(1);
    expect(snapshot.playbackSignals.player_start).toBe(1);
    expect(snapshot.playbackSignals.player_pause).toBe(1);
    expect(snapshot.playbackSignals.player_resume).toBe(1);
    expect(snapshot.playbackSignals.player_skip).toBe(1);
    expect(snapshot.playbackSignals.volume_change).toBe(1);
    expect(snapshot.playbackSignals.queue_delete).toBe(1);
    expect(history.record).toHaveBeenCalledTimes(1);
  });

  it('records guild-scoped playback failures for operational troubleshooting', () => {
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
        detail: 'ffmpeg ok',
      },
    } as never);

    const queue = {
      guild: { id: 'guild-failure' },
      channel: { id: 'voice-1' },
      metadata: { textChannelId: 'text-1' },
      currentTrack: {
        title: 'Track B',
        url: 'https://youtube.com/watch?v=track-b',
        raw: { source: 'youtubei' },
      },
      isPlaying: () => false,
      delete: vi.fn(),
    };

    const error = new Error('Could not extract stream for this track');

    player.events.emit(GuildQueueEvent.PlayerError, queue, error);

    const snapshot = operationalTelemetry.getGuildSnapshot('guild-failure');
    expect(snapshot.failures.total).toBe(1);
    expect(snapshot.failures.byCode.stream_unavailable).toBe(1);
    expect(handleRuntimeFault).toHaveBeenCalledTimes(1);
  });
});
