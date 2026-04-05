import { Collection } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { OwnerControlService } from '../../src/modules/diagnostics/services/ownerControlService.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('owner control service', () => {
  it('sends the startup DM only once per process lifecycle', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const service = createService();

    const client = createClient({
      users: {
        fetch: vi.fn().mockResolvedValue({
          send,
        }),
      },
    });

    const first = await service.sendStartupOnlineNotification(client as never);
    const second = await service.sendStartupOnlineNotification(client as never);

    expect(first.delivered).toBe(true);
    expect(first.skipped).toBe(false);
    expect(second.delivered).toBe(false);
    expect(second.skipped).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports the official guild with settings and session context when the guild is present', async () => {
    const service = createService({
      guildSettings: {
        getSettings: vi.fn().mockResolvedValue({
          prefix: '!',
          defaultVolume: 70,
          autoplayEnabled: true,
          resumeQueueEnabled: true,
        }),
      },
      playbackSessions: {
        get: vi.fn().mockResolvedValue({
          currentTrack: { title: 'Current' },
          items: [{ title: 'Next' }],
        }),
      },
      player: {
        nodes: {
          get: vi.fn().mockReturnValue({
            currentTrack: {
              title: 'Current',
            },
            size: 1,
          }),
        },
      },
    });

    service.attachPlaybackSessionManager({
      getDiagnostics: vi.fn().mockResolvedValue(
        createSessionDiagnostics({
          state: 'pending',
          health: 'recoverable',
          healthDetail: 'Sessao persistida pronta para recover com 2 faixa(s).',
          hasPersistedSession: true,
          itemCount: 2,
          recoveryReady: true,
          voiceChannelId: 'voice-1',
          textChannelId: 'text-1',
          lastSyncReason: 'recover',
          lastRecoveryTrigger: 'startup',
          lastRecoveryStatus: 'success',
          lastRecoveryAttempts: 1,
          lastRecoveryDurationMs: 900,
          lastRecoveryRecoveredTrackCount: 2,
        }),
      ),
    } as never);

    const client = createClient({
      guilds: {
        cache: new Collection([
          [
            '1489363867023835310',
            {
              id: '1489363867023835310',
              name: 'PHONIX HQ',
              memberCount: 42,
            },
          ],
        ]),
        fetch: vi.fn(),
      },
    });

    const notice = await service.createOfficialGuildNotice(client as never);

    expect(notice.title).toBe('PHONIX | Official guild');
    expect(notice.description).toContain('PHONIX HQ');
    expect(notice.fields?.some((field) => field.name === 'Referencia oficial' && field.value.includes('PHONIX HQ'))).toBe(true);
    expect(notice.fields?.some((field) => field.name === 'Configuracao da guild oficial' && field.value.includes('resume queue'))).toBe(true);
    expect(notice.fields?.some((field) => field.name === 'Sessao e recovery' && field.value.includes('Diagnostics'))).toBe(true);
  });
});

function createService(overrides: {
  guildSettings?: Record<string, unknown>;
  playbackSessions?: Record<string, unknown>;
  player?: Record<string, unknown>;
} = {}) {
  return new OwnerControlService({
    config: {
      appVersion: '2.1.0',
      discordToken: 'token',
      discordClientId: 'client-1',
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
    },
    prisma: {
      guildSettings: {
        count: vi.fn().mockResolvedValue(1),
      },
      operationalIncident: {
        count: vi.fn().mockResolvedValue(0),
      },
    } as never,
    ffmpeg: {
      available: true,
      executable: 'ffmpeg',
      detail: 'ffmpeg ok',
    },
    expectedSlashCommands: 20,
    player: ({
      nodes: {
        get: vi.fn().mockReturnValue(null),
      },
      ...overrides.player,
    } as never),
    operationalTelemetry: {
      getGuildSnapshot: vi.fn().mockReturnValue({
        guildId: 'guild-1',
        commands: { total: 0, failed: 0, byCommand: {}, last: null },
        failures: { total: 0, byCode: {}, last: null },
        playbackSignals: {},
        reconnects: { started: 0, completed: 0, failed: 0 },
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
      recordRuntimeWarning: vi.fn(),
    } as never,
    operationalTelemetryStore: {
      getRuntimeWarningSnapshot: vi.fn().mockResolvedValue({
        total: 0,
        recent: [],
      }),
      getRecentIncidents: vi.fn().mockResolvedValue([]),
    } as never,
    guildSettings: ({
      getSettings: vi.fn().mockResolvedValue({
        prefix: '!',
        defaultVolume: 70,
        autoplayEnabled: false,
        resumeQueueEnabled: true,
      }),
      ...overrides.guildSettings,
    } as never),
    playbackSessions: ({
      get: vi.fn().mockResolvedValue(null),
      ...overrides.playbackSessions,
    } as never),
  });
}

function createClient(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      tag: 'PHONIX#6820',
    },
    ws: {
      ping: 42,
    },
    application: {
      commands: {
        fetch: vi.fn().mockResolvedValue(new Collection(Array.from({ length: 20 }, (_, index) => [`${index}`, {}]))),
      },
    },
    guilds: {
      cache: new Collection(),
      fetch: vi.fn().mockRejectedValue(new Error('missing')),
    },
    users: {
      fetch: vi.fn(),
    },
    ...overrides,
  };
}
