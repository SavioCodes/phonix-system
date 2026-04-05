import { EventEmitter } from 'node:events';
import { SoundCloudExtractor, SpotifyExtractor } from '@discord-player/extractor';
import { PermissionFlagsBits } from 'discord.js';
import { QueueRepeatMode } from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import { describe, expect, it, vi } from 'vitest';
import {
  buildGuildNodeOptions,
  buildVoiceConnectionOptions,
  buildYoutubeExtractorOptions,
  describeConfiguredPlaybackRoutes,
  inferTrackPlaybackRoute,
  MusicService,
  normalizePlayableQuery,
  normalizeSpotifyUrl,
  PlaybackUnavailableError,
  PlaybackSearchNoResultsError,
  QueueCapacityReachedError,
  resolveYouTubePlaybackProfile,
  UnsupportedPlaybackUrlError,
  UserNotInVoiceChannelError,
  VOICE_CONNECTION_TIMEOUT_MS,
  VoiceChannelPermissionError,
  VoiceConnectionTimeoutError,
} from '../../src/modules/music/musicService.js';

function createQueueStub(overrides: Record<string, unknown> = {}) {
  return {
    setMetadata: vi.fn(),
    isPlaying: () => false,
    addTrack: vi.fn(),
    insertTrack: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn(),
    currentTrack: null,
    size: 0,
    tracks: {
      toArray: () => [],
    },
    node: {
      getTimestamp: () => null,
    },
    ...overrides,
  };
}

function createTrackStub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'track-1',
    title: 'Night Drive',
    author: 'Synthwave',
    duration: '3:45',
    durationMS: 225000,
    thumbnail: 'thumb.png',
    ...overrides,
  };
}

function createSearchResultStub(tracks = [createTrackStub()], options: { hasPlaylist?: boolean } = {}) {
  return {
    tracks,
    isEmpty: () => tracks.length === 0,
    hasPlaylist: () => options.hasPlaylist ?? false,
  };
}

function createPlayResultStub(queue = createQueueStub(), track = createTrackStub(), searchResult = createSearchResultStub([track])) {
  return {
    queue,
    track,
    searchResult,
  };
}

describe('music service node options', () => {
  it('builds playback node options for queue behavior', () => {
    const options = buildGuildNodeOptions(
      {
        textChannelId: 'text-1',
      },
      70,
      QueueRepeatMode.AUTOPLAY,
    );

    expect(options.metadata).toEqual({ textChannelId: 'text-1' });
    expect(options.volume).toBe(70);
    expect(options.repeatMode).toBe(QueueRepeatMode.AUTOPLAY);
    expect(options.selfDeaf).toBe(true);
    expect(options.maxSize).toBe(100);
    expect(options.maxHistorySize).toBe(20);
    expect(options.connectionTimeout).toBe(VOICE_CONNECTION_TIMEOUT_MS);
  });

  it('defaults repeat mode to off when autoplay is disabled', () => {
    const options = buildGuildNodeOptions(
      {
        textChannelId: 'text-2',
      },
      55,
      QueueRepeatMode.OFF,
    );

    expect(options.repeatMode).toBe(QueueRepeatMode.OFF);
  });

  it('builds voice connection options with DAVE enabled', () => {
    expect(buildVoiceConnectionOptions()).toEqual({
      daveEncryption: true,
      timeout: VOICE_CONNECTION_TIMEOUT_MS,
    });
  });

  it('builds youtube extractor options with youtube-dl stream pipeline enabled', () => {
    expect(buildYoutubeExtractorOptions()).toEqual({
      disablePlayer: true,
      generateWithPoToken: false,
      useYoutubeDL: true,
      logLevel: 'NONE',
      streamOptions: {
        useClient: 'ANDROID',
      },
    });
  });

  it('activates fidelity profile only when cookie is configured', () => {
    expect(
      resolveYouTubePlaybackProfile({
        profile: 'fidelity',
      }),
    ).toMatchObject({
      requestedProfile: 'fidelity',
      effectiveProfile: 'compatibility',
      downgradeReason: expect.stringContaining('YOUTUBE_COOKIE'),
      streamClient: 'ANDROID',
      useYoutubeDL: true,
      disablePlayer: true,
      generateWithPoToken: false,
      pipeline: 'youtube-dl',
    });

    expect(
      resolveYouTubePlaybackProfile({
        profile: 'fidelity',
        cookie: 'SID=abc;',
      }),
    ).toMatchObject({
      requestedProfile: 'fidelity',
      effectiveProfile: 'fidelity',
      downgradeReason: null,
      streamClient: 'WEB',
      highWaterMark: 1048576,
      overrideBridgeMode: 'ytmusic',
      useYoutubeDL: false,
      disablePlayer: false,
      generateWithPoToken: true,
      pipeline: 'youtubei',
    });
  });

  it('builds fidelity extractor options with cookie, WEB client and higher highWaterMark', () => {
    expect(
      buildYoutubeExtractorOptions({
        profile: 'fidelity',
        cookie: 'SID=abc;',
        highWaterMark: 2097152,
      }),
    ).toEqual({
      disablePlayer: false,
      generateWithPoToken: true,
      useYoutubeDL: false,
      logLevel: 'NONE',
      cookie: 'SID=abc;',
      overrideBridgeMode: 'ytmusic',
      streamOptions: {
        useClient: 'WEB',
        highWaterMark: 2097152,
      },
    });
  });

  it('describes the configured playback routes with the real stream pipeline', () => {
    expect(describeConfiguredPlaybackRoutes(true)).toEqual({
      youtube: {
        provider: 'youtube',
        pipeline: 'youtube-dl',
        routeKind: 'native',
        requestedProfile: 'compatibility',
        effectiveProfile: 'compatibility',
        downgradeReason: null,
        client: 'ANDROID',
        highWaterMark: null,
        cookieConfigured: false,
        overrideBridgeMode: null,
        useYoutubeDL: true,
        disablePlayer: true,
        generateWithPoToken: false,
      },
      spotify: {
        provider: 'spotify',
        pipeline: 'spotify-bridge',
        routeKind: 'bridge',
        enabled: true,
      },
    });
  });

  it('infers youtube and spotify playback routes for telemetry', () => {
    expect(
      inferTrackPlaybackRoute({
        url: 'https://youtu.be/abc12345678',
        raw: { source: 'youtubei' },
      } as never),
    ).toEqual({
      provider: 'youtube',
      pipeline: 'youtubei',
      routeKind: 'native',
    });

    expect(
      inferTrackPlaybackRoute({
        url: 'https://open.spotify.com/track/123',
        raw: { source: 'spotify' },
      } as never),
    ).toEqual({
      provider: 'spotify',
      pipeline: 'spotify-bridge',
      routeKind: 'bridge',
    });
  });

  it('passes DAVE-enabled connection options into player.play', async () => {
    const track = createTrackStub();
    const queue = createQueueStub({
      currentTrack: track,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockResolvedValue(createPlayResultStub(queue, track));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(80),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    await service.play(
      {
        guild: {
          id: 'guild-1',
        },
      } as never,
      'neon blade',
      {
        id: 'user-1',
      } as never,
      {
        textChannelId: 'text-1',
      },
    );

    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0]?.[2]?.connectionOptions?.daveEncryption).toBe(true);
    expect(play.mock.calls[0]?.[2]?.connectionOptions?.timeout).toBe(VOICE_CONNECTION_TIMEOUT_MS);
    expect(play.mock.calls[0]?.[2]?.nodeOptions?.repeatMode).toBe(QueueRepeatMode.AUTOPLAY);
  });

  it('normalizes youtube watch URLs with playlist params before playback', async () => {
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=etKoUy0hfv0',
    });
    const queue = createQueueStub({
      currentTrack: track,
    });
    const search = vi.fn().mockResolvedValue(createSearchResultStub([track]));
    const play = vi.fn().mockResolvedValue(createPlayResultStub(queue, track));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(80),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await service.play(
      {
        guild: {
          id: 'guild-yt',
        },
      } as never,
      'https://www.youtube.com/watch?v=etKoUy0hfv0&list=RDMMT4fU8HsyKBs&index=6',
      {
        id: 'user-yt',
      } as never,
      {
        textChannelId: 'text-yt',
      },
    );

    expect(search.mock.calls[0]?.[0]).toBe('https://www.youtube.com/watch?v=etKoUy0hfv0');
  });

  it('waits for playback start when the queue was idle', async () => {
    const events = new EventEmitter();
    const track = createTrackStub();
    const queue = createQueueStub({
      currentTrack: track,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockImplementation(async () => {
      queueMicrotask(() => {
        events.emit('playerStart', {
          guild: {
            id: 'guild-start',
          },
        });
      });

      return createPlayResultStub(queue, track);
    });

    const service = new MusicService(
      {
        play,
        search,
        events,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-start',
          },
        } as never,
        'night drive',
        {
          id: 'user-start',
        } as never,
        {
          textChannelId: 'text-start',
        },
      ),
    ).resolves.toMatchObject({
      track: {
        title: 'Night Drive',
      },
      startedPlayback: true,
      mode: 'queue',
      entry: {
        preparedVoiceConnection: true,
        reusedActiveQueue: false,
        awaitedPlaybackStart: true,
        compatibilityFallbackUsed: false,
      },
    });
  });

  it('turns voice aborts into a friendly connection timeout error', async () => {
    const events = new EventEmitter();
    const track = createTrackStub();
    const queue = createQueueStub({
      currentTrack: track,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockImplementation(async () => {
      queueMicrotask(() => {
        const error = new Error('The operation was aborted: This operation was aborted');
        error.name = 'AbortError';
        Object.assign(error, {
          code: 'ABORT_ERR',
        });

        events.emit('error', {
          guild: {
            id: 'guild-abort',
          },
          isPlaying: () => false,
        }, error);
      });

      return createPlayResultStub(queue, track);
    });

    const service = new MusicService(
      {
        play,
        search,
        events,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-abort',
          },
        } as never,
        'night drive',
        {
          id: 'user-abort',
        } as never,
        {
          textChannelId: 'text-abort',
        },
      ),
    ).rejects.toThrow(VoiceConnectionTimeoutError);
  });

  it('preserves the attempted playback route when playerError fires before playback actually starts', async () => {
    const events = new EventEmitter();
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=abc123',
      raw: {
        source: 'youtubei',
      },
    });
    const queue = createQueueStub({
      currentTrack: null,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockImplementation(async () => {
      queueMicrotask(() => {
        const error = new Error('Could not extract stream for this track');
        Object.assign(error, {
          code: 'ERR_NO_RESULT',
          name: 'NoResultError',
        });

        events.emit(
          'playerError',
          {
            guild: {
              id: 'guild-player-error',
            },
            currentTrack: null,
          },
          error,
        );
      });

      return createPlayResultStub(queue, track);
    });

    const service = new MusicService(
      {
        play,
        search,
        events,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-player-error',
          },
        } as never,
        'night drive',
        {
          id: 'user-player-error',
        } as never,
        {
          textChannelId: 'text-player-error',
        },
      ),
    ).rejects.toMatchObject({
      name: 'PlaybackUnavailableError',
      provider: 'youtube',
      pipeline: 'youtube-dl',
    } satisfies Partial<PlaybackUnavailableError>);
  });

  it('uses the configured youtube fidelity pipeline for text-search failures when the runtime is in fidelity mode', async () => {
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=abc123',
      raw: {
        source: 'youtubei',
      },
    });
    const queue = createQueueStub({
      currentTrack: track,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockRejectedValue(new Error('Could not extract stream for this track'));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
        youtube: {
          profile: 'fidelity',
          cookie: 'SID=abc;',
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-fidelity-stream-route',
          },
        } as never,
        'night drive',
        {
          id: 'user-fidelity-stream-route',
        } as never,
        {
          textChannelId: 'text-fidelity-stream-route',
        },
      ),
    ).rejects.toMatchObject({
      name: 'PlaybackUnavailableError',
      provider: 'youtube',
      pipeline: 'youtubei',
    } satisfies Partial<PlaybackUnavailableError>);
  });

  it('retries in compatibility mode when fidelity youtubei streaming fails', async () => {
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=fallback123',
      raw: {
        source: 'youtubei',
      },
    });
    const queue = createQueueStub({
      channel: {
        id: 'voice-fallback',
        name: 'Musica',
      },
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi
      .fn()
      .mockRejectedValueOnce(new Error('Could not extract stream for this track'))
      .mockResolvedValueOnce(createPlayResultStub(queue, track, searchResult));
    const youtubeExtractor = {
      options: {
        streamOptions: {
          useClient: 'WEB',
          highWaterMark: 1048576,
        },
        useYoutubeDL: false,
        disablePlayer: false,
        generateWithPoToken: true,
        overrideBridgeMode: 'ytmusic',
      },
      setClientMode: vi.fn(),
    };
    const service = new MusicService(
      {
        play,
        search,
        extractors: {
          get: vi.fn().mockReturnValue(youtubeExtractor),
        },
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
        youtube: {
          profile: 'fidelity',
          cookie: 'SID=fallback;',
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    const result = await service.play(
      {
        guild: {
          id: 'guild-fallback',
        },
      } as never,
      'retry fallback route',
      {
        id: 'user-fallback',
      } as never,
      {
        textChannelId: 'text-fallback',
      },
    );

    expect(play).toHaveBeenCalledTimes(2);
    expect(youtubeExtractor.setClientMode).toHaveBeenCalledWith('ANDROID');
    expect(youtubeExtractor.options.useYoutubeDL).toBe(true);
    expect(youtubeExtractor.options.disablePlayer).toBe(true);
    expect(youtubeExtractor.options.generateWithPoToken).toBe(false);
    expect(service.describePlaybackRoutes().youtube.effectiveProfile).toBe('compatibility');
    expect(service.describePlaybackRoutes().youtube.pipeline).toBe('youtube-dl');
    expect(service.describePlaybackRoutes().youtube.downgradeReason).toContain('Runtime degradado para compatibility');
    expect(result.pipeline).toBe('youtube-dl');
    expect(result.entry.compatibilityFallbackUsed).toBe(true);
  });

  it('downgrades the runtime during startup stabilization when the native youtubei probe fails', async () => {
    const youtubeExtractor = {
      innerTube: {
        getBasicInfo: vi.fn().mockResolvedValue({
          download: vi.fn().mockRejectedValue(new Error('No valid URL to decipher')),
        }),
      },
      options: {
        streamOptions: {
          useClient: 'WEB',
          highWaterMark: 1048576,
        },
        useYoutubeDL: false,
        disablePlayer: false,
        generateWithPoToken: true,
        overrideBridgeMode: 'ytmusic',
      },
      setClientMode: vi.fn(),
    };
    const service = new MusicService(
      {
        extractors: {
          get: vi.fn().mockReturnValue(youtubeExtractor),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
        youtube: {
          profile: 'fidelity',
          cookie: 'SID=fallback;',
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(service.stabilizeYoutubeRuntime()).resolves.toBe(true);
    expect(youtubeExtractor.innerTube.getBasicInfo).toHaveBeenCalledTimes(1);
    expect(youtubeExtractor.setClientMode).toHaveBeenCalledWith('ANDROID');
    expect(service.describePlaybackRoutes().youtube.effectiveProfile).toBe('compatibility');
    expect(service.describePlaybackRoutes().youtube.pipeline).toBe('youtube-dl');
    expect(service.describePlaybackRoutes().youtube.generateWithPoToken).toBe(false);
  });

  it('cleans up an empty queue left behind after a playback startup failure', async () => {
    const queue = createQueueStub({
      channel: {
        id: 'voice-cleanup',
        name: 'Musica',
      },
    });
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=cleanup123',
      raw: {
        source: 'youtubei',
      },
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockRejectedValue(new Error('Could not extract stream for this track'));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
        youtube: {
          profile: 'fidelity',
          cookie: 'SID=cleanup;',
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-cleanup',
          },
        } as never,
        'cleanup route',
        {
          id: 'user-cleanup',
        } as never,
        {
          textChannelId: 'text-cleanup',
        },
      ),
    ).rejects.toBeInstanceOf(PlaybackUnavailableError);

    expect(queue.delete).toHaveBeenCalledTimes(1);
  });

  it('prefers the observed SoundCloud extractor failure over the originally requested route', async () => {
    const events = new EventEmitter();
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=abc123',
      raw: {
        source: 'youtubei',
      },
    });
    const queue = createQueueStub({
      currentTrack: null,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockImplementation(async () => {
      queueMicrotask(() => {
        const error = new Error(
          'Could not extract stream for this track\n\nError: Could not extract stream from this track source\n    at _SoundCloudExtractor.stream',
        );
        Object.assign(error, {
          code: 'ERR_NO_RESULT',
          name: 'NoResultError',
        });

        events.emit(
          'playerError',
          {
            guild: {
              id: 'guild-soundcloud-fallback',
            },
            currentTrack: null,
          },
          error,
        );
      });

      return createPlayResultStub(queue, track);
    });

    const service = new MusicService(
      {
        play,
        search,
        events,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-soundcloud-fallback',
          },
        } as never,
        'night drive',
        {
          id: 'user-soundcloud-fallback',
        } as never,
        {
          textChannelId: 'text-soundcloud-fallback',
        },
      ),
    ).rejects.toMatchObject({
      name: 'PlaybackUnavailableError',
      provider: 'soundcloud',
      pipeline: 'soundcloud-extractor',
    } satisfies Partial<PlaybackUnavailableError>);
  });

  it('annotates stream extraction failures with the attempted playback route for text searches', async () => {
    const track = createTrackStub({
      url: 'https://www.youtube.com/watch?v=abc123',
      raw: {
        source: 'youtubei',
      },
    });
    const queue = createQueueStub({
      currentTrack: track,
    });
    const searchResult = createSearchResultStub([track]);
    const search = vi.fn().mockResolvedValue(searchResult);
    const play = vi.fn().mockRejectedValue(new Error('Could not extract stream for this track'));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-stream-route',
          },
        } as never,
        'night drive',
        {
          id: 'user-stream-route',
        } as never,
        {
          textChannelId: 'text-stream-route',
        },
      ),
    ).rejects.toMatchObject({
      name: 'PlaybackUnavailableError',
      provider: 'youtube',
      pipeline: 'youtube-dl',
    } satisfies Partial<PlaybackUnavailableError>);
  });

  it('connects queues with DAVE enabled on join', async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const setMetadata = vi.fn();
    const create = vi.fn().mockReturnValue({
      dispatcher: null,
      connect,
      setMetadata,
      isPlaying: () => false,
    });
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create,
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(65),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    const voiceChannel = {
      id: 'voice-1',
    };
    const member = {
      guild: {
        id: 'guild-1',
      },
      voice: {
        channel: voiceChannel,
      },
    };

    await service.join(member as never, { textChannelId: 'text-join' });

    expect(create).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(voiceChannel, {
      daveEncryption: true,
      timeout: VOICE_CONNECTION_TIMEOUT_MS,
    });
    expect(setMetadata).toHaveBeenCalledWith({ textChannelId: 'text-join' });
  });

  it('requires the user to be inside a voice channel', () => {
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {} as never,
    );

    expect(() =>
      service.requireMemberVoiceChannel({
        voice: {
          channel: null,
        },
      } as never),
    ).toThrow(UserNotInVoiceChannelError);
  });

  it('resets stale queues before enforcing same-channel validation', () => {
    const deleteQueue = vi.fn();
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue({
            channel: {
              id: 'voice-1',
            },
            dispatcher: {
              voiceConnection: {
                state: {
                  status: 'destroyed',
                },
              },
            },
            isPlaying: () => false,
            delete: deleteQueue,
          }),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {} as never,
    );

    const result = service.ensureSameVoiceChannel({
      guild: { id: 'guild-1' },
      voice: {
        channel: {
          id: 'voice-1',
        },
      },
    } as never);

    expect(result.id).toBe('voice-1');
    expect(deleteQueue).toHaveBeenCalledTimes(1);
  });

  it('blocks playback when the bot is already connected to another voice channel', () => {
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue({
            channel: {
              id: 'voice-1',
              name: 'Sala 1',
            },
            dispatcher: {
              voiceConnection: {
                state: {
                  status: 'ready',
                },
              },
            },
            isPlaying: () => true,
          }),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {} as never,
    );

    expect(() =>
      service.ensureSameVoiceChannel({
        guild: { id: 'guild-1' },
        voice: {
          channel: {
            id: 'voice-2',
            name: 'Sala 2',
          },
        },
      } as never),
    ).toThrow(/\/stop/);
  });

  it('pre-validates missing bot voice permissions before joining the channel', async () => {
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {} as never,
    );

    const permissions = {
      has: vi.fn((permission: bigint) => permission !== BigInt(PermissionFlagsBits.Speak)),
    };

    await expect(
      service.ensurePlayableVoiceChannel({
        guild: {
          id: 'guild-1',
          members: {
            me: { id: 'bot-1' },
          },
        },
        voice: {
          channel: {
            id: 'voice-1',
            name: 'Synth Room',
            permissionsFor: vi.fn().mockReturnValue(permissions),
          },
        },
      } as never),
    ).rejects.toThrow(VoiceChannelPermissionError);
  });

  it('creates queues with playback limits and without voice-only connection flags', async () => {
    const create = vi.fn().mockReturnValue({
      setMetadata: vi.fn(),
      isPlaying: () => false,
    });
    const service = new MusicService(
      {
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create,
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(72),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    await service.ensureQueue({ id: 'guild-9' } as never, { textChannelId: 'text-queue' });

    expect(create).toHaveBeenCalledTimes(1);
    const options = create.mock.calls[0]?.[1];
    expect(options.metadata).toEqual({ textChannelId: 'text-queue' });
    expect(options.volume).toBe(72);
    expect(options.repeatMode).toBe(QueueRepeatMode.AUTOPLAY);
    expect(options.selfDeaf).toBe(true);
    expect(options.maxSize).toBe(100);
    expect(options.maxHistorySize).toBe(20);
    expect(options.connectionTimeout).toBe(VOICE_CONNECTION_TIMEOUT_MS);
    expect('daveEncryption' in options).toBe(false);
  });

  it('registers the youtube extractor with youtube-dl stream pipeline enabled', async () => {
    const loadMulti = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue(undefined);
    const service = new MusicService(
      {
        extractors: {
          loadMulti,
          register,
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(72),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    await service.setupExtractors();

    expect(loadMulti).toHaveBeenCalledTimes(1);
    const extractorBundle = loadMulti.mock.calls[0]?.[0] as unknown[];
    expect(extractorBundle).not.toContain(SpotifyExtractor);
    expect(extractorBundle).not.toContain(SoundCloudExtractor);
    expect(register).toHaveBeenCalledWith(YoutubeiExtractor, {
      disablePlayer: true,
      generateWithPoToken: false,
      useYoutubeDL: true,
      logLevel: 'NONE',
      streamOptions: {
        useClient: 'ANDROID',
      },
    });
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('registers the youtube extractor in fidelity mode only when cookie is available', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const service = new MusicService(
      {
        extractors: {
          loadMulti: vi.fn().mockResolvedValue(undefined),
          register,
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
        youtube: {
          profile: 'fidelity',
          cookie: 'SID=abc;',
          highWaterMark: 2097152,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(72),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    await service.setupExtractors();

    expect(register).toHaveBeenCalledWith(YoutubeiExtractor, {
      disablePlayer: false,
      generateWithPoToken: true,
      useYoutubeDL: false,
      logLevel: 'NONE',
      cookie: 'SID=abc;',
      overrideBridgeMode: 'ytmusic',
      streamOptions: {
        useClient: 'WEB',
        highWaterMark: 2097152,
      },
    });
  });

  it('registers spotify extractor only when spotify credentials are enabled', async () => {
    const register = vi.fn().mockResolvedValue(undefined);
    const service = new MusicService(
      {
        extractors: {
          loadMulti: vi.fn().mockResolvedValue(undefined),
          register,
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: 'spotify-client',
          clientSecret: 'spotify-secret',
          enabled: true,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(72),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    await service.setupExtractors();

    expect(register).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenNthCalledWith(2, SpotifyExtractor, {
      clientId: 'spotify-client',
      clientSecret: 'spotify-secret',
    });
  });

  it('inserts the new track right after the current one in next mode', async () => {
    const currentTrack = createTrackStub({
      id: 'current-track',
      title: 'Current Track',
      durationMS: 180000,
    });
    const nextTrack = createTrackStub({
      id: 'next-track',
      title: 'Next Track',
      durationMS: 240000,
    });
    const queue = createQueueStub({
      currentTrack,
      isPlaying: () => true,
      tracks: {
        toArray: () => [nextTrack],
      },
      node: {
        getTimestamp: () => ({
          current: {
            value: 30000,
          },
        }),
      },
    });
    const search = vi.fn().mockResolvedValue(createSearchResultStub([nextTrack]));
    const service = new MusicService(
      {
        search,
        nodes: {
          get: vi.fn().mockReturnValue(queue),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    const result = await service.play(
      {
        guild: {
          id: 'guild-next',
        },
      } as never,
      'next track',
      {
        id: 'user-next',
      } as never,
      {
        textChannelId: 'text-next',
      },
      {
        mode: 'next',
      },
    );

    expect(search).toHaveBeenCalledTimes(1);
    expect(queue.insertTrack).toHaveBeenCalledWith(nextTrack, 0);
    expect(result.mode).toBe('next');
    expect(result.queuePosition).toBe(1);
    expect(result.estimatedWait).toBe('2:30');
    expect(result.entry).toMatchObject({
      preparedVoiceConnection: true,
      reusedActiveQueue: true,
      awaitedPlaybackStart: false,
      compatibilityFallbackUsed: false,
    });
  });

  it('searches before replacing the queue so failed searches do not destroy the current session', async () => {
    const deleteQueue = vi.fn();
    const queue = createQueueStub({
      currentTrack: createTrackStub({
        id: 'current-track',
      }),
      isPlaying: () => true,
      delete: deleteQueue,
    });
    const replacementTrack = createTrackStub({
      id: 'replacement-track',
      title: 'Replacement Track',
    });
    const play = vi.fn().mockResolvedValue(
      createPlayResultStub(
        createQueueStub({
          currentTrack: replacementTrack,
        }),
        replacementTrack,
        createSearchResultStub([replacementTrack]),
      ),
    );
    const search = vi.fn().mockResolvedValue(createSearchResultStub([replacementTrack]));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(queue),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    const result = await service.play(
      {
        guild: {
          id: 'guild-replace',
        },
      } as never,
      'replacement track',
      {
        id: 'user-replace',
      } as never,
      {
        textChannelId: 'text-replace',
      },
      {
        mode: 'replace',
      },
    );

    expect(search.mock.invocationCallOrder[0]).toBeLessThan(play.mock.invocationCallOrder[0]);
    expect(deleteQueue).toHaveBeenCalledTimes(1);
    expect(result.mode).toBe('replace');
    expect(result.startedPlayback).toBe(true);
  });

  it('forces spotify source for text searches when requested', async () => {
    const track = createTrackStub({
      id: 'spotify-track',
    });
    const queue = createQueueStub({
      currentTrack: track,
    });
    const search = vi.fn().mockResolvedValue(createSearchResultStub([track]));
    const play = vi.fn().mockResolvedValue(createPlayResultStub(queue, track, createSearchResultStub([track])));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: 'spotify-client',
          clientSecret: 'spotify-secret',
          enabled: true,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    const result = await service.play(
      {
        guild: {
          id: 'guild-spotify',
        },
      } as never,
      'night city',
      {
        id: 'user-spotify',
      } as never,
      {
        textChannelId: 'text-spotify',
      },
      {
        forcedSource: 'spotify',
      },
    );

    expect(search.mock.calls[0]?.[1]?.searchEngine).toContain('spotify');
    expect(result.source).toBe('Spotify');
  });

  it('rejects unsupported http URLs before trying to search', async () => {
    const search = vi.fn();
    const service = new MusicService(
      {
        play: vi.fn(),
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(createQueueStub()),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-url',
          },
          name: 'Synth Room',
        } as never,
        'https://example.com/file.mp3',
        {
          id: 'user-url',
        } as never,
        {
          textChannelId: 'text-url',
        },
      ),
    ).rejects.toThrow(UnsupportedPlaybackUrlError);
    expect(search).not.toHaveBeenCalled();
  });

  it('surfaces search misses with a dedicated no-results error', async () => {
    const search = vi.fn().mockResolvedValue(createSearchResultStub([]));
    const service = new MusicService(
      {
        play: vi.fn(),
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(createQueueStub()),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-empty',
          },
          name: 'Synth Room',
        } as never,
        'something impossible to find',
        {
          id: 'user-empty',
        } as never,
        {
          textChannelId: 'text-empty',
        },
      ),
    ).rejects.toThrow(PlaybackSearchNoResultsError);
  });

  it('truncates oversized playlists to the safe queue limit before playback starts', async () => {
    const tracks = Array.from({ length: 140 }, (_, index) =>
      createTrackStub({
        id: `track-${index + 1}`,
        title: `Track ${index + 1}`,
      }),
    );
    const queue = createQueueStub({
      currentTrack: tracks[0],
      repeatMode: QueueRepeatMode.AUTOPLAY,
      channel: {
        name: 'Playlist Room',
      },
    });
    const search = vi.fn().mockResolvedValue(createSearchResultStub(tracks, { hasPlaylist: true }));
    const play = vi.fn().mockResolvedValue(createPlayResultStub(queue, tracks[0], createSearchResultStub(tracks, { hasPlaylist: true })));
    const service = new MusicService(
      {
        play,
        search,
        nodes: {
          get: vi.fn().mockReturnValue(undefined),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(true),
      } as never,
    );

    const result = await service.play(
      {
        guild: {
          id: 'guild-playlist',
        },
        name: 'Playlist Room',
      } as never,
      'city mix',
      {
        id: 'user-playlist',
      } as never,
      {
        textChannelId: 'text-playlist',
      },
    );

    expect(Array.isArray(play.mock.calls[0]?.[1])).toBe(true);
    expect((play.mock.calls[0]?.[1] as unknown[])?.length).toBe(101);
    expect(result.resultType).toBe('playlist');
    expect(result.addedCount).toBe(101);
    expect(result.requestedCount).toBe(140);
    expect(result.truncatedCount).toBe(39);
    expect(result.autoplayEnabled).toBe(true);
  });

  it('rejects new additions when the pending queue already reached the safe limit', async () => {
    const queuedTrack = createTrackStub({
      id: 'queued-track',
    });
    const queue = createQueueStub({
      currentTrack: createTrackStub({
        id: 'current-track',
      }),
      size: 100,
      isPlaying: () => true,
      tracks: {
        toArray: () => Array.from({ length: 100 }, () => queuedTrack),
      },
      channel: {
        name: 'Busy Room',
      },
    });
    const search = vi.fn().mockResolvedValue(createSearchResultStub([createTrackStub({ id: 'new-track' })]));
    const service = new MusicService(
      {
        search,
        nodes: {
          get: vi.fn().mockReturnValue(queue),
          create: vi.fn().mockReturnValue(queue),
        },
      } as never,
      {
        discordToken: 'token',
        discordClientId: 'client',
        discordGuildId: undefined,
        databaseUrl: 'file:./data/test.db',
        prefix: '!',
        ffmpegPath: 'ffmpeg',
        spotify: {
          clientId: '',
          clientSecret: '',
          enabled: false,
        },
      },
      {
        getDefaultVolume: vi.fn().mockResolvedValue(70),
        isAutoplayEnabled: vi.fn().mockResolvedValue(false),
      } as never,
    );

    await expect(
      service.play(
        {
          guild: {
            id: 'guild-full',
          },
          name: 'Busy Room',
        } as never,
        'overflow track',
        {
          id: 'user-full',
        } as never,
        {
          textChannelId: 'text-full',
        },
      ),
    ).rejects.toThrow(QueueCapacityReachedError);
  });

  it('normalizes youtube URLs without touching plain searches', () => {
    expect(normalizePlayableQuery('lofi chuva')).toBe('lofi chuva');
    expect(normalizePlayableQuery('https://youtu.be/abc123?t=42')).toBe('https://www.youtube.com/watch?v=abc123&t=42');
    expect(normalizePlayableQuery('https://music.youtube.com/watch?v=abc123&list=RDabc123&index=4')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
    expect(normalizeSpotifyUrl('https://open.spotify.com/intl-pt/track/abc123?si=xyz')).toBe('https://open.spotify.com/track/abc123');
  });
});
