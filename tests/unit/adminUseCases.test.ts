import { describe, expect, it, vi } from 'vitest';
import { createAdminUseCases } from '../../src/modules/diagnostics/use-cases/adminUseCases.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('admin use cases', () => {
  it('setResumeQueue enables persistence and syncs the active queue', async () => {
    const setResumeQueue = vi.fn().mockResolvedValue({ resumeQueueEnabled: true });
    const handleResumeQueueSettingChange = vi.fn().mockResolvedValue(undefined);
    const syncActiveQueue = vi.fn().mockResolvedValue(undefined);

    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        setResumeQueue,
      } as never,
      playbackSessionManager: {
        handleResumeQueueSettingChange,
        syncActiveQueue,
      } as never,
      music: {} as never,
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
    });

    const result = await useCases.setResumeQueue({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: () => true,
        },
      } as never,
      userId: 'admin-user',
      enabled: true,
    });

    expect(result.kind).toBe('notice');
    expect(result.description).toContain('persistencia de fila foi ativada');
    expect(result.fields?.some((field) => field.name === 'Persistencia da guild' && field.value.includes('ativado'))).toBe(true);
    expect(setResumeQueue).toHaveBeenCalledWith('guild-1', true);
    expect(handleResumeQueueSettingChange).toHaveBeenCalledWith('guild-1', true);
    expect(syncActiveQueue).toHaveBeenCalledWith('guild-1');
  });

  it('setPrefix translates domain validation into a titled command validation error', async () => {
    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        setPrefix: vi.fn().mockRejectedValue(new Error('O prefixo nao pode conter espacos.')),
      } as never,
      playbackSessionManager: {} as never,
      music: {} as never,
      player: {} as never,
    });

    await expect(
      useCases.setPrefix({
        guildId: 'guild-1',
        member: {
          permissions: {
            has: () => true,
          },
        } as never,
        userId: 'admin-user',
        value: 'meu prefixo',
      }),
    ).rejects.toMatchObject({
      title: 'Prefixo invalido',
      message: 'O prefixo nao pode conter espacos.',
    });
  });

  it('configView returns stable settings and diagnostics DTOs', async () => {
    const settings = {
      prefix: '?',
      defaultVolume: 80,
      autoplayEnabled: true,
      resumeQueueEnabled: true,
    };
    const sessionDiagnostics = createSessionDiagnostics({
      state: 'active',
      health: 'healthy',
      healthDetail: 'Fila ao vivo com 3 faixa(s) rastreadas nesta guild.',
      hasPersistedSession: true,
      hasActiveQueue: true,
      itemCount: 2,
      liveItemCount: 3,
      hasCurrentTrack: true,
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      lastSyncReason: 'playerStart',
      lastRecoveryTrigger: 'startup',
      lastRecoveryStatus: 'success',
      lastRecoveryAttemptAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryAttempts: 1,
      lastRecoveryDurationMs: 1000,
      lastSuccessfulRecoveryAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryRecoveredTrackCount: 2,
    });

    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        getSettings: vi.fn().mockResolvedValue(settings),
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(sessionDiagnostics),
      } as never,
      music: {} as never,
      player: {} as never,
    });

    const result = await useCases.configView({
      guildId: 'guild-1',
      liveVolume: 64,
    });

    expect(result).toEqual({
      settings,
      sessionDiagnostics,
      liveVolume: 64,
    });
  });

  it('help returns contextual onboarding data for the selected page', async () => {
    const settings = {
      prefix: '!',
      defaultVolume: 70,
      autoplayEnabled: false,
      resumeQueueEnabled: true,
    };
    const sessionDiagnostics = createSessionDiagnostics({
      state: 'pending',
      health: 'recoverable',
      healthDetail: 'Sessao persistida pronta para recover com 4 faixa(s).',
      hasPersistedSession: true,
      itemCount: 4,
      recoveryReady: true,
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      lastSyncReason: 'recover',
      lastRecoveryTrigger: 'startup',
      lastRecoveryStatus: 'success',
      lastRecoveryAttemptAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryAttempts: 1,
      lastRecoveryDurationMs: 1500,
      lastSuccessfulRecoveryAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryRecoveredTrackCount: 4,
    });

    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        getSettings: vi.fn().mockResolvedValue(settings),
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(sessionDiagnostics),
      } as never,
      music: {} as never,
      player: {
        nodes: {
          get: vi.fn().mockReturnValue({
            currentTrack: { title: 'Track atual' },
            size: 1,
          }),
        },
      } as never,
    });

    const result = await useCases.help({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: () => true,
        },
      } as never,
      userId: 'user-1',
      currentPage: 'recovery',
    });

    expect(result.prefix).toBe('!');
    expect(result.currentPage).toBe('recovery');
    expect(result.resumeQueueEnabled).toBe(true);
    expect(result.hasActiveQueue).toBe(true);
    expect(result.memberIsAdmin).toBe(true);
    expect(result.memberIsOwner).toBe(false);
    expect(result.pages.home.title).toContain('Comece por aqui');
    expect(result.pages.home.fields.some((field) => field.name === 'Estado desta guild agora')).toBe(true);
    expect(result.pages.recovery.fields[0]?.value).toContain('Resume queue');
    expect(result.pages.recovery.fields.some((field) => field.name === 'Estado desta guild agora')).toBe(true);
    expect(result.pages.recovery.fields.some((field) => field.name === 'O que fazer agora')).toBe(true);
  });

  it('help makes Spotify bridge explicit on the playback page', async () => {
    const settings = {
      prefix: '!',
      defaultVolume: 70,
      autoplayEnabled: false,
      resumeQueueEnabled: true,
    };
    const sessionDiagnostics = createSessionDiagnostics();

    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        getSettings: vi.fn().mockResolvedValue(settings),
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(sessionDiagnostics),
      } as never,
      music: {} as never,
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
    });

    const result = await useCases.help({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: () => false,
        },
      } as never,
      userId: 'user-1',
      currentPage: 'playback',
    });

    expect(result.pages.playback.fields.some((field) => field.name === 'Clareza de source')).toBe(true);
    expect(result.pages.playback.fields.some((field) => field.name === 'O que faz sentido agora')).toBe(true);
    expect(result.pages.playback.fields.some((field) => field.value.includes('Spotify hoje funciona por bridge'))).toBe(true);
    expect(result.pages.playback.fields.some((field) => field.value.includes('soundcloud'))).toBe(true);
  });

  it('help exposes the owner surface when the configured owner opens the admin page', async () => {
    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        getSettings: vi.fn().mockResolvedValue({
          prefix: '!',
          defaultVolume: 70,
          autoplayEnabled: false,
          resumeQueueEnabled: true,
        }),
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(createSessionDiagnostics()),
      } as never,
      music: {} as never,
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(null),
        },
      } as never,
    });

    const result = await useCases.help({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: () => false,
        },
      } as never,
      userId: '976586934455513159',
      currentPage: 'admin',
    });

    expect(result.memberIsOwner).toBe(true);
    expect(result.pages.admin.fields.some((field) => field.name === 'Owner global')).toBe(true);
    expect(result.pages.admin.fields.some((field) => field.name === 'Leitura desta guild')).toBe(true);
    expect(result.pages.admin.fields.some((field) => field.name === 'Como agir agora')).toBe(true);
    expect(result.pages.admin.fields.some((field) => field.value.includes('/owner status'))).toBe(true);
  });

  it('setDefaultVolume syncs the live queue volume when a session is active', async () => {
    const setDefaultVolume = vi.fn().mockResolvedValue({ defaultVolume: 82 });
    const setLiveVolume = vi.fn();

    const useCases = createAdminUseCases({
      doctor: {} as never,
      guildSettings: {
        setDefaultVolume,
      } as never,
      playbackSessionManager: {} as never,
      music: {} as never,
      player: {} as never,
    });

    const result = await useCases.setDefaultVolume({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: () => true,
        },
      } as never,
      userId: 'admin-user',
      value: 82,
      liveVolume: 64,
      setLiveVolume,
    });

    expect(result.description).toContain('82%');
    expect(result.fields?.some((field) => field.name === 'Sessao atual' && field.value.includes('82%'))).toBe(true);
    expect(setDefaultVolume).toHaveBeenCalledWith('guild-1', 82);
    expect(setLiveVolume).toHaveBeenCalledWith(82);
  });

  it('doctor blocks non-admin users outside the owner policy', async () => {
    const useCases = createAdminUseCases({
      doctor: {
        run: vi.fn(),
      } as never,
      guildSettings: {} as never,
      playbackSessionManager: {} as never,
      music: {} as never,
      player: {} as never,
    });

    await expect(
      useCases.doctor({
        client: {} as never,
        guild: {} as never,
        member: {
          permissions: {
            has: () => false,
          },
        } as never,
        userId: 'user-1',
        textChannelId: 'text-1',
      }),
    ).rejects.toMatchObject({
      title: 'Permissao administrativa necessaria',
    });
  });
});
