import type { PrismaClient } from '@prisma/client';
import {
  Collection,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
  type Client,
  type Guild,
  type GuildMember,
} from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../../src/core/config/env.js';
import { DoctorService } from '../../src/modules/diagnostics/services/doctorService.js';
import type { FfmpegStatus } from '../../src/modules/music/ffmpeg.js';
import type { OperationalTelemetryService } from '../../src/modules/diagnostics/services/operationalTelemetryService.js';
import type { OperationalTelemetryStoreService } from '../../src/modules/diagnostics/services/operationalTelemetryStoreService.js';

describe('doctor service', () => {
  it('reports a healthy runtime when all checks pass', async () => {
    const service = new DoctorService(
      createConfig({ discordGuildId: 'guild-1', spotify: { clientId: 'abc', clientSecret: 'def', enabled: true } }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg version 7.1',
      },
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub(),
    );

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const botMember = {
      permissionsIn: vi.fn().mockReturnValue(fullPermissions),
    };

    const guild = {
      id: 'guild-1',
      commands: {
        fetch: vi.fn().mockResolvedValue(
          new Collection([
            ['1', {}],
            ['2', {}],
            ['3', {}],
            ['4', {}],
          ]),
        ),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
      channels: {
        cache: new Collection([
          [
            'text-1',
            {
              id: 'text-1',
              name: 'geral',
              isTextBased: () => true,
            },
          ],
        ]),
      },
    } as unknown as Guild;

    const member = {
      voice: {
        channel: {
          id: 'voice-1',
          name: 'musica',
          bitrate: 64000,
        },
      },
    } as unknown as GuildMember;

    const client = {
      isReady: () => true,
      user: {
        tag: 'PHONIX#0001',
      },
      ws: {
        ping: 42,
      },
      application: {
        id: 'client-1',
        commands: {
          fetch: vi.fn(),
        },
      },
      options: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      },
    } as unknown as Client;

    const report = await service.run({
      client,
      guild,
      member,
      textChannelId: 'text-1',
    });

    expect(report.overallStatus).toBe('ok');
    expect(report.appVersion).toBe('2.3.0');
    expect(report.summary.error).toBe(0);
    expect(report.summary.warning).toBe(0);
    expect(report.checks.some((check) => check.label === 'Dashboard admin center' && check.status === 'ok')).toBe(true);
    expect(report.checks.some((check) => check.label === 'FFmpeg' && check.status === 'ok')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('youtube-dl'))).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('nativa'))).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('compatibility'))).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('nao sai do source original'))).toBe(true);
    expect(report.checks.some((check) => check.label === 'Voice playback target' && check.detail.includes('64 kbps'))).toBe(true);
  });

  it('surfaces runtime downgrade to compatibility when the music service degrades youtubei after stream failures', async () => {
    const service = new DoctorService(
      createConfig({ discordGuildId: 'guild-1', spotify: { clientId: 'abc', clientSecret: 'def', enabled: true } }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg version 7.1',
      },
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub(),
    );
    service.attachMusicService({
      describePlaybackRoutes: vi.fn().mockReturnValue({
        youtube: {
          provider: 'youtube',
          pipeline: 'youtube-dl',
          routeKind: 'native',
          requestedProfile: 'fidelity',
          effectiveProfile: 'compatibility',
          downgradeReason: 'Runtime degradado para compatibility depois de falha real no pipeline fidelity/youtubei.',
          client: 'ANDROID',
          highWaterMark: null,
          cookieConfigured: true,
          generateWithPoToken: false,
          overrideBridgeMode: null,
          useYoutubeDL: true,
          disablePlayer: true,
        },
        spotify: {
          provider: 'spotify',
          pipeline: 'spotify-bridge',
          routeKind: 'bridge',
          enabled: true,
        },
      }),
    } as never);

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const botMember = {
      permissionsIn: vi.fn().mockReturnValue(fullPermissions),
    };

    const guild = {
      id: 'guild-1',
      commands: {
        fetch: vi.fn().mockResolvedValue(new Collection([['1', {}], ['2', {}], ['3', {}], ['4', {}]])),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
      channels: {
        cache: new Collection([
          [
            'text-1',
            {
              id: 'text-1',
              name: 'geral',
              isTextBased: () => true,
            },
          ],
        ]),
      },
    } as unknown as Guild;

    const member = {
      voice: {
        channel: {
          id: 'voice-1',
          name: 'musica',
          bitrate: 64000,
        },
      },
    } as unknown as GuildMember;

    const client = {
      isReady: () => true,
      user: {
        tag: 'PHONIX#0001',
      },
      ws: {
        ping: 42,
      },
      application: {
        id: 'client-1',
        commands: {
          fetch: vi.fn(),
        },
      },
      options: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      },
    } as unknown as Client;

    const report = await service.run({
      client,
      guild,
      member,
      textChannelId: 'text-1',
    });

    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.status === 'warning')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('Runtime degradado para compatibility'))).toBe(true);
    expect(report.nextActions?.some((action) => action.includes('compatibility') && action.includes('youtubei'))).toBe(true);
  });

  it('does not report an empty residual queue as an active player state', async () => {
    const service = new DoctorService(
      createConfig({ discordGuildId: 'guild-1', spotify: { clientId: 'abc', clientSecret: 'def', enabled: true } }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg version 7.1',
      },
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue({
            channel: {
              id: 'voice-1',
              name: 'musica',
            },
            currentTrack: null,
            size: 0,
            isPlaying: () => false,
            dispatcher: {
              voiceConnection: {
                state: {
                  status: 'ready',
                },
              },
            },
          }),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub(),
    );

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const botMember = {
      permissionsIn: vi.fn().mockReturnValue(fullPermissions),
    };

    const guild = {
      id: 'guild-1',
      commands: {
        fetch: vi.fn().mockResolvedValue(new Collection([['1', {}]])),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
      channels: {
        cache: new Collection([
          [
            'text-1',
            {
              id: 'text-1',
              name: 'geral',
              isTextBased: () => true,
            },
          ],
        ]),
      },
    } as unknown as Guild;

    const member = {
      voice: {
        channel: {
          id: 'voice-1',
          name: 'musica',
          bitrate: 64000,
        },
      },
    } as unknown as GuildMember;

    const client = {
      isReady: () => true,
      user: {
        tag: 'PHONIX#0001',
      },
      ws: {
        ping: 42,
      },
      application: {
        id: 'client-1',
        commands: {
          fetch: vi.fn(),
        },
      },
      options: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      },
    } as unknown as Client;

    const report = await service.run({
      client,
      guild,
      member,
      textChannelId: 'text-1',
    });

    expect(report.checks.some((check) => check.label === 'Player state' && check.detail === 'Nenhuma fila ativa nesta guild no momento.')).toBe(true);
    expect(
      report.checks.some(
        (check) => check.label === 'Playback session' && check.detail.includes('Nenhuma sessao pendente ou ativa precisa ser recuperada'),
      ),
    ).toBe(true);
  });

  it('reports warnings and errors when runtime dependencies are degraded', async () => {
    const service = new DoctorService(
      createConfig({ discordGuildId: undefined, spotify: { clientId: '', clientSecret: '', enabled: false } }),
      {
        guildSettings: {
          count: vi.fn().mockRejectedValue(new Error('sqlite unavailable')),
        },
        guildPlaybackSession: {
          count: vi.fn().mockRejectedValue(new Error('sqlite unavailable')),
        },
      } as unknown as PrismaClient,
      {
        available: false,
        executable: 'ffmpeg',
        detail: 'spawn ffmpeg ENOENT',
      } satisfies FfmpegStatus,
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(false),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub({
        total: 1,
        recent: [
          {
            occurredAt: new Date(),
            category: 'runtime_warning',
            guildId: '',
            type: 'DeprecationWarning',
            code: 'DEP0040',
            message: 'punycode',
          },
        ],
      }),
    );

    const botMember = {
      permissionsIn: vi.fn().mockImplementation((channel: { id: string }) => {
        if (channel.id === 'text-1') {
          return new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
        }

        return new PermissionsBitField([PermissionFlagsBits.ViewChannel]);
      }),
    };

    const client = {
      isReady: () => true,
      user: {
        tag: 'PHONIX#0001',
      },
      ws: {
        ping: 120,
      },
      application: {
        id: 'client-1',
        commands: {
          fetch: vi.fn().mockResolvedValue(new Collection([['1', {}]])),
        },
      },
      options: {
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
      },
    } as unknown as Client;

    const guild = {
      id: 'guild-2',
      commands: {
        fetch: vi.fn(),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
      channels: {
        cache: new Collection([
          [
            'text-1',
            {
              id: 'text-1',
              name: 'geral',
              isTextBased: () => true,
            },
          ],
        ]),
      },
    } as unknown as Guild;

    const member = {
      voice: {
        channel: null,
      },
    } as unknown as GuildMember;

    const report = await service.run({
      client,
      guild,
      member,
      textChannelId: 'text-1',
    });

    expect(report.overallStatus).toBe('error');
    expect(report.summary.error).toBeGreaterThan(0);
    expect(report.summary.warning).toBeGreaterThan(0);
    expect(report.checks.some((check) => check.label === 'Dashboard admin center' && check.status === 'ok')).toBe(true);
    expect(report.checks.some((check) => check.label === 'FFmpeg' && check.status === 'error')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Spotify' && check.status === 'warning')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Database' && check.status === 'error')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Voice playback target' && check.status === 'warning')).toBe(true);
    expect(report.nextActions?.some((action) => action.includes('FFmpeg'))).toBe(true);
    expect(report.nextActions?.some((action) => action.includes('deploy:commands'))).toBe(true);
  });

  it('surfaces operational failures from guild telemetry', async () => {
    const service = new DoctorService(
      createConfig({ discordGuildId: undefined, spotify: { clientId: '', clientSecret: '', enabled: false } }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg ok',
      } satisfies FfmpegStatus,
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue({
            channel: {
              name: 'musica',
            },
            dispatcher: {
              voiceConnection: {
                state: {
                  status: 'ready',
                },
              },
            },
            currentTrack: {
              title: 'Track A',
            },
            size: 2,
          }),
        },
      } as never,
      {
        getGuildSnapshot: vi.fn().mockReturnValue({
          guildId: 'guild-3',
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
            last: null,
            active: null,
          },
          recentIncidents: [],
        }),
        getGuildSnapshotWithHistory: vi.fn().mockResolvedValue({
          guildId: 'guild-3',
          commands: {
            total: 3,
            failed: 1,
            byCommand: {},
            last: null,
          },
          failures: {
            total: 2,
            byCode: {
              voice_connection_timeout: 2,
            },
            last: null,
          },
          playbackSignals: {},
          reconnects: {
            started: 2,
            completed: 1,
            failed: 1,
          },
          recoveries: {
            started: 2,
            succeeded: 1,
            failed: 1,
            aborted: 0,
            retried: 1,
            averageDurationMs: 2100,
            last: null,
            active: null,
          },
          recentIncidents: [
            {
              category: 'failure',
              guildId: 'guild-3',
              type: 'playback_failure',
              message: 'timeout',
              terminal: true,
            },
          ],
        }),
      } as never,
      createOperationalTelemetryStoreStub(),
    );

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const report = await service.run({
      client: {
        isReady: () => true,
        user: {
          tag: 'PHONIX#0001',
        },
        ws: {
          ping: 50,
        },
        application: {
          id: 'client-1',
          commands: {
            fetch: vi.fn().mockResolvedValue(new Collection([['1', {}], ['2', {}], ['3', {}], ['4', {}]])),
          },
        },
        options: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
          ],
        },
      } as never,
      guild: {
        id: 'guild-3',
        commands: {
          fetch: vi.fn(),
        },
        members: {
          me: {
            permissionsIn: vi.fn().mockReturnValue(fullPermissions),
          },
          fetchMe: vi.fn(),
        },
        channels: {
          cache: new Collection([
            [
              'text-1',
              {
                id: 'text-1',
                name: 'geral',
                isTextBased: () => true,
              },
            ],
          ]),
        },
      } as never,
      member: {
        voice: {
          channel: {
            id: 'voice-1',
            name: 'musica',
          },
        },
      } as never,
      textChannelId: 'text-1',
    });

    expect(report.checks.some((check) => check.label === 'Operational telemetry' && check.status === 'error')).toBe(true);
  });

  it('warns when fidelity is requested without cookie and keeps compatibility as the effective profile', async () => {
    const service = new DoctorService(
      createConfig({
        discordGuildId: 'guild-1',
        youtube: {
          profile: 'fidelity',
        },
      }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg version 7.1',
      },
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub(),
    );

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const botMember = {
      permissionsIn: vi.fn().mockReturnValue(fullPermissions),
    };

    const guild = {
      id: 'guild-1',
      commands: {
        fetch: vi.fn().mockResolvedValue(
          new Collection([
            ['1', {}],
            ['2', {}],
            ['3', {}],
            ['4', {}],
          ]),
        ),
      },
      members: {
        me: botMember,
        fetchMe: vi.fn().mockResolvedValue(botMember),
      },
      channels: {
        cache: new Collection([
          [
            'text-1',
            {
              id: 'text-1',
              name: 'geral',
              isTextBased: () => true,
            },
          ],
        ]),
      },
    } as unknown as Guild;

    const member = {
      voice: {
        channel: {
          id: 'voice-1',
          name: 'musica',
          bitrate: 128000,
        },
      },
    } as unknown as GuildMember;

    const client = {
      isReady: () => true,
      user: {
        tag: 'PHONIX#0001',
      },
      ws: {
        ping: 42,
      },
      application: {
        id: 'client-1',
        commands: {
          fetch: vi.fn(),
        },
      },
      options: {
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildVoiceStates,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ],
      },
    } as unknown as Client;

    const report = await service.run({
      client,
      guild,
      member,
      textChannelId: 'text-1',
    });

    expect(report.overallStatus).toBe('warning');
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.status === 'warning')).toBe(true);
    expect(report.checks.some((check) => check.label === 'Playback pipeline' && check.detail.includes('YOUTUBE_COOKIE'))).toBe(true);
    expect(report.nextActions?.some((action) => action.includes('YOUTUBE_COOKIE'))).toBe(true);
  });

  it('warns when the dashboard is requested but cannot be enabled with the current env', async () => {
    const service = new DoctorService(
      createConfig({
        discordGuildId: 'guild-1',
        dashboard: {
          enabled: true,
          port: 3000,
        },
      }),
      {
        guildSettings: {
          count: vi.fn().mockResolvedValue(1),
        },
        guildPlaybackSession: {
          count: vi.fn().mockResolvedValue(0),
        },
      } as unknown as PrismaClient,
      {
        available: true,
        executable: 'ffmpeg',
        detail: 'ffmpeg version 7.1',
      },
      4,
      {
        isResumeQueueEnabled: vi.fn().mockResolvedValue(true),
      } as never,
      {
        get: vi.fn().mockResolvedValue(null),
      } as never,
      {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
      createOperationalTelemetryStub(),
      createOperationalTelemetryStoreStub(),
    );

    const fullPermissions = new PermissionsBitField([
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.Connect,
      PermissionFlagsBits.Speak,
    ]);

    const report = await service.run({
      client: {
        isReady: () => true,
        user: {
          tag: 'PHONIX#0001',
        },
        ws: {
          ping: 42,
        },
        application: {
          id: 'client-1',
          commands: {
            fetch: vi.fn(),
          },
        },
        options: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
          ],
        },
      } as never,
      guild: {
        id: 'guild-1',
        commands: {
          fetch: vi.fn().mockResolvedValue(new Collection([['1', {}], ['2', {}], ['3', {}], ['4', {}]])),
        },
        members: {
          me: {
            permissionsIn: vi.fn().mockReturnValue(fullPermissions),
          },
          fetchMe: vi.fn(),
        },
        channels: {
          cache: new Collection([
            [
              'text-1',
              {
                id: 'text-1',
                name: 'geral',
                isTextBased: () => true,
              },
            ],
          ]),
        },
      } as never,
      textChannelId: 'text-1',
    });

    expect(report.checks.some((check) => check.label === 'Dashboard admin center' && check.status === 'warning')).toBe(true);
    expect(report.nextActions?.some((action) => action.includes('DASHBOARD_BASE_URL'))).toBe(true);
  });
});

function createConfig(overrides: Partial<AppConfig>): AppConfig {
  return {
    appVersion: '2.3.0',
    discordToken: 'token',
    discordClientId: 'client-1',
    discordGuildId: 'guild-1',
    databaseUrl: 'file:./data/test.db',
    prefix: '!',
    ffmpegPath: 'ffmpeg',
    spotify: {
      clientId: '',
      clientSecret: '',
      enabled: false,
    },
    youtube: {
      profile: 'compatibility',
    },
    dashboard: {
      enabled: false,
      port: 3000,
    },
    ...overrides,
  };
}

function createOperationalTelemetryStub() {
  return {
    getGuildSnapshot: vi.fn().mockReturnValue({
      guildId: 'guild-1',
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
        last: null,
        active: null,
      },
      recentIncidents: [],
    }),
    getGuildSnapshotWithHistory: vi.fn().mockResolvedValue({
      guildId: 'guild-1',
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
        last: null,
        active: null,
      },
      recentIncidents: [],
    }),
  } as unknown as OperationalTelemetryService;
}

function createOperationalTelemetryStoreStub(overrides?: {
  total: number;
  recent: Array<Record<string, unknown>>;
}) {
  return {
    getRuntimeWarningSnapshot: vi.fn().mockResolvedValue({
      total: overrides?.total ?? 0,
      recent: overrides?.recent ?? [],
    }),
  } as unknown as OperationalTelemetryStoreService;
}
