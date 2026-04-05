import { QueueRepeatMode } from 'discord-player';
import { Collection } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyPlayerError } from '../../src/modules/music/playbackFaults.js';
import { PlaybackSessionManager } from '../../src/modules/music/playbackSessionManager.js';

vi.mock('../../src/modules/music/trackCodec.js', () => ({
  serializeTrack: vi.fn((track: { title: string; url: string }) => ({
    title: track.title,
    url: track.url,
    author: 'Mock Artist',
    thumbnail: 'https://img.test/mock.jpg',
    duration: '3:00',
    source: 'youtube',
    encodedTrack: `encoded:${track.url}`,
  })),
}));

function createQueueStub(overrides: Record<string, unknown> = {}) {
  return {
    guild: {
      id: 'guild-1',
      members: {
        me: {
          permissionsIn: vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true),
          }),
        },
        fetchMe: vi.fn(),
      },
    },
    metadata: {
      textChannelId: 'text-1',
    },
    channel: {
      id: 'voice-1',
      name: 'musica',
      members: new Collection([
        [
          'user-1',
          {
            user: {
              bot: false,
            },
          },
        ],
      ]),
    },
    currentTrack: {
      title: 'Track A',
      url: 'https://youtube.com/watch?v=track-a',
    },
    tracks: {
      toArray: () => [
        {
          title: 'Track B',
          url: 'https://youtube.com/watch?v=track-b',
        },
      ],
    },
    node: {
      volume: 82,
    },
    repeatMode: QueueRepeatMode.AUTOPLAY,
    size: 1,
    delete: vi.fn(),
    ...overrides,
  };
}

describe('playback session manager', () => {
  const save = vi.fn();
  const clear = vi.fn();
  const get = vi.fn();
  const list = vi.fn();
  const isResumeQueueEnabled = vi.fn();
  const recoverPlaybackSession = vi.fn();
  const operationalTelemetry = {
    recordRecoveryStarted: vi.fn(),
    recordRecoverySucceeded: vi.fn(),
    recordRecoveryFailed: vi.fn(),
    recordRecoveryAborted: vi.fn(),
    recordPlaybackSignal: vi.fn(),
  };
  let manager: PlaybackSessionManager;
  let queue: ReturnType<typeof createQueueStub>;
  let player: {
    client: {
      user: {
        id: string;
      };
    };
    events: { on: ReturnType<typeof vi.fn> };
    nodes: {
      get: ReturnType<typeof vi.fn>;
      cache: Map<string, unknown>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();

    queue = createQueueStub();
    player = {
      client: {
        user: {
          id: 'bot-1',
        },
      },
      events: {
        on: vi.fn(),
      },
      nodes: {
        get: vi.fn().mockReturnValue(queue),
        cache: new Map([['guild-1', queue]]),
      },
    };

    manager = new PlaybackSessionManager(
      player as never,
      {
        requireMemberVoiceChannel: vi.fn((member) => member.voice.channel),
        recoverPlaybackSession,
      } as never,
      {
        isResumeQueueEnabled,
      } as never,
      {
        save,
        clear,
        get,
        list,
      } as never,
      operationalTelemetry as never,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists the active queue snapshot with current track and upcoming items', async () => {
    isResumeQueueEnabled.mockResolvedValue(true);
    save.mockResolvedValue(undefined);

    await manager.syncActiveQueue('guild-1');

    expect(save).toHaveBeenCalledWith({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      currentTrack: expect.objectContaining({
        title: 'Track A',
      }),
      items: [
        expect.objectContaining({
          title: 'Track B',
        }),
      ],
      volume: 82,
      repeatMode: QueueRepeatMode.AUTOPLAY,
      autoplayEnabled: true,
    });
  });

  it('clears persisted sessions when resume queue is disabled', async () => {
    await manager.handleResumeQueueSettingChange('guild-1', false);

    expect(clear).toHaveBeenCalledWith('guild-1');
    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'active',
      lastSyncReason: 'configDisabled',
    });
  });

  it('does not treat an empty residual queue as an active healthy session', async () => {
    player.nodes.get.mockReturnValue(
      createQueueStub({
        currentTrack: null,
        size: 0,
        tracks: {
          toArray: () => [],
        },
        isPlaying: () => false,
      }),
    );
    get.mockResolvedValue(null);
    isResumeQueueEnabled.mockResolvedValue(true);

    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'none',
      hasActiveQueue: false,
      liveItemCount: 0,
      health: 'healthy',
    });
  });

  it('keeps the session pending on startup when no human user is in the saved voice channel', async () => {
    isResumeQueueEnabled.mockResolvedValue(true);
    player.nodes.get.mockReturnValue(null);
    get.mockResolvedValue({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      currentTrack: {
        title: 'Track A',
        url: 'https://youtube.com/watch?v=track-a',
        author: 'Artist',
        thumbnail: 'https://img.test/a.jpg',
        duration: '3:00',
        source: 'youtube',
        encodedTrack: 'encoded-a',
      },
      items: [],
      volume: 82,
      repeatMode: QueueRepeatMode.OFF,
      autoplayEnabled: false,
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    });
    list.mockResolvedValue([
      {
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        currentTrack: {
          title: 'Track A',
          url: 'https://youtube.com/watch?v=track-a',
          author: 'Artist',
          thumbnail: 'https://img.test/a.jpg',
          duration: '3:00',
          source: 'youtube',
          encodedTrack: 'encoded-a',
        },
        items: [],
        volume: 82,
        repeatMode: QueueRepeatMode.OFF,
        autoplayEnabled: false,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);

    const voiceChannel = {
      id: 'voice-1',
      isVoiceBased: () => true,
      members: new Collection([
        [
          'bot-1',
          {
            user: {
              bot: true,
            },
          },
        ],
      ]),
    };

    const client = {
      user: {
        id: 'bot-1',
      },
      guilds: {
        cache: new Collection([
          [
            'guild-1',
            {
              id: 'guild-1',
              channels: {
                cache: new Collection([['voice-1', voiceChannel]]),
                fetch: vi.fn(),
              },
              members: {
                me: {
                  permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true),
                  }),
                },
                fetchMe: vi.fn(),
              },
            },
          ],
        ]),
        fetch: vi.fn(),
      },
    };

    await manager.recoverPersistedSessions(client as never);

    expect(recoverPlaybackSession).not.toHaveBeenCalled();
    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'pending',
      health: 'recoverable',
      recoveryReady: false,
      lastAutoRecoverBlockReason: expect.stringContaining('nenhum usuario humano'),
    });
  });

  it('auto-recovers startup sessions when humans are still in the saved voice channel', async () => {
    isResumeQueueEnabled.mockResolvedValue(true);
    get.mockResolvedValue({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      currentTrack: {
        title: 'Track A',
      },
      items: [],
      volume: 82,
      repeatMode: QueueRepeatMode.AUTOPLAY,
      autoplayEnabled: true,
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    });
    list.mockResolvedValue([
      {
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        currentTrack: {
          title: 'Track A',
          url: 'https://youtube.com/watch?v=track-a',
          author: 'Artist',
          thumbnail: 'https://img.test/a.jpg',
          duration: '3:00',
          source: 'youtube',
          encodedTrack: 'encoded-a',
        },
        items: [],
        volume: 82,
        repeatMode: QueueRepeatMode.AUTOPLAY,
        autoplayEnabled: true,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);
    save.mockResolvedValue(undefined);
    recoverPlaybackSession.mockResolvedValue({
      queue,
      track: {
        title: 'Track A',
      },
      recoveredTrackCount: 1,
      skippedTrackCount: 0,
    });

    const voiceChannel = {
      id: 'voice-1',
      isVoiceBased: () => true,
      members: new Collection([
        [
          'user-1',
          {
            user: {
              bot: false,
            },
          },
        ],
      ]),
    };

    const client = {
      user: {
        id: 'bot-1',
      },
      guilds: {
        cache: new Collection([
          [
            'guild-1',
            {
              id: 'guild-1',
              channels: {
                cache: new Collection([['voice-1', voiceChannel]]),
                fetch: vi.fn(),
              },
              members: {
                me: {
                  permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true),
                  }),
                },
                fetchMe: vi.fn(),
              },
            },
          ],
        ]),
        fetch: vi.fn(),
      },
    };

    await manager.recoverPersistedSessions(client as never);

    expect(recoverPlaybackSession).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'active',
      health: 'healthy',
      lastSyncReason: 'recover',
      lastAutoRecoverBlockReason: null,
    });
  });

  it('marks the session as partial when recovery succeeds but skips saved tracks', async () => {
    isResumeQueueEnabled.mockResolvedValue(true);
    get.mockResolvedValue({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      currentTrack: {
        title: 'Track A',
      },
      items: [{ position: 1, track: { title: 'Track B' } }],
      volume: 82,
      repeatMode: QueueRepeatMode.AUTOPLAY,
      autoplayEnabled: true,
      createdAt: new Date('2026-04-02T00:00:00.000Z'),
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
    });
    list.mockResolvedValue([
      {
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        currentTrack: {
          title: 'Track A',
          url: 'https://youtube.com/watch?v=track-a',
          author: 'Artist',
          thumbnail: 'https://img.test/a.jpg',
          duration: '3:00',
          source: 'youtube',
          encodedTrack: 'encoded-a',
        },
        items: [
          {
            position: 1,
            track: {
              title: 'Track B',
              url: 'https://youtube.com/watch?v=track-b',
              author: 'Artist',
              thumbnail: 'https://img.test/b.jpg',
              duration: '3:00',
              source: 'youtube',
              encodedTrack: 'encoded-b',
            },
          },
        ],
        volume: 82,
        repeatMode: QueueRepeatMode.AUTOPLAY,
        autoplayEnabled: true,
        createdAt: new Date('2026-04-02T00:00:00.000Z'),
        updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      },
    ]);
    save.mockResolvedValue(undefined);
    recoverPlaybackSession.mockResolvedValue({
      queue,
      track: {
        title: 'Track A',
      },
      requestedTrackCount: 2,
      recoveredTrackCount: 1,
      skippedTrackCount: 1,
      restoredCurrentTrack: true,
      restoredUpcomingTrackCount: 0,
      volume: 82,
      repeatMode: QueueRepeatMode.AUTOPLAY,
      autoplayEnabled: true,
    });

    const voiceChannel = {
      id: 'voice-1',
      isVoiceBased: () => true,
      members: new Collection([
        [
          'user-1',
          {
            user: {
              bot: false,
            },
          },
        ],
      ]),
    };

    const client = {
      user: {
        id: 'bot-1',
      },
      guilds: {
        cache: new Collection([
          [
            'guild-1',
            {
              id: 'guild-1',
              channels: {
                cache: new Collection([['voice-1', voiceChannel]]),
                fetch: vi.fn(),
              },
              members: {
                me: {
                  permissionsIn: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true),
                  }),
                },
                fetchMe: vi.fn(),
              },
            },
          ],
        ]),
        fetch: vi.fn(),
      },
    };

    await manager.recoverPersistedSessions(client as never);

    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'active',
      health: 'partial',
      lastRecoveryRecoveredTrackCount: 1,
      lastRecoverySkippedTrackCount: 1,
    });
  });

  it('retries recoverable runtime faults with a bounded automatic retry window', async () => {
    vi.useFakeTimers();

    isResumeQueueEnabled.mockResolvedValue(true);
    get.mockResolvedValue(null);
    save.mockResolvedValue(undefined);
    recoverPlaybackSession
      .mockRejectedValueOnce(new Error('Could not extract stream for this track'))
      .mockResolvedValueOnce({
        queue,
        track: {
          title: 'Track A',
        },
        recoveredTrackCount: 1,
        skippedTrackCount: 0,
      });

    const descriptor = classifyPlayerError(
      new Error('Could not extract stream for this track'),
      queue.currentTrack as never,
    );

    const recoveryPromise = manager.handleRuntimeFault(queue as never, descriptor, 'player_error');
    await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_FOR_TESTS_MS);
    await recoveryPromise;

    expect(recoverPlaybackSession).toHaveBeenCalledTimes(2);
    expect(operationalTelemetry.recordRecoveryStarted).toHaveBeenCalledTimes(2);
    expect(operationalTelemetry.recordRecoverySucceeded).toHaveBeenCalledTimes(1);
    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      state: 'active',
      lastRecoveryStatus: 'success',
      lastAutoRecoverBlockReason: null,
    });
  });

  it('aborts automatic recovery after the retry limit to avoid infinite loops', async () => {
    vi.useFakeTimers();

    isResumeQueueEnabled.mockResolvedValue(true);
    get.mockResolvedValue(null);
    recoverPlaybackSession.mockRejectedValue(new Error('Could not extract stream for this track'));

    const descriptor = classifyPlayerError(
      new Error('Could not extract stream for this track'),
      queue.currentTrack as never,
    );

    const recoveryPromise = manager.handleRuntimeFault(queue as never, descriptor, 'player_error');
    const recoveryExpectation = expect(recoveryPromise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(RECOVERY_DELAY_FOR_TESTS_MS * 2);
    await recoveryExpectation;

    expect(recoverPlaybackSession).toHaveBeenCalledTimes(2);
    expect(operationalTelemetry.recordRecoveryAborted).toHaveBeenCalled();
    await expect(manager.getDiagnostics('guild-1')).resolves.toMatchObject({
      lastRecoveryStatus: 'aborted',
      lastAutoRecoverBlockReason: expect.stringContaining('Recovery esgotado'),
    });
  });
});

const RECOVERY_DELAY_FOR_TESTS_MS = 1_600;
