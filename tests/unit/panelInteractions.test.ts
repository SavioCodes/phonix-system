import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { handlePanelComponentInteraction } from '../../src/modules/commands/panelInteractions.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('panel interaction system', () => {
  it('ignores unrelated custom ids', async () => {
    const handled = await handlePanelComponentInteraction(
      {
        customId: 'help:refresh:home:guild-1:user-1',
      } as never,
      {} as never,
    );

    expect(handled).toBe(false);
  });

  it('blocks other users from interacting with someone else panel', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    const handled = await handlePanelComponentInteraction(
      {
        customId: 'phx:queue:refresh:guild-1:user-1',
        user: { id: 'user-2' },
        guildId: 'guild-1',
        guild: {},
        inGuild: () => true,
        deferred: false,
        replied: false,
        reply,
      } as never,
      {} as never,
    );

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith({
      content: 'Este painel pertence a outra pessoa. Rode o comando novamente para abrir o seu.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('refreshes the queue panel in place through the same message', async () => {
    const queue = vi.fn().mockResolvedValue({
      kind: 'queue',
      title: 'PHONIX | Fila ativa',
      description: 'Sessao ativa em **Synth Room**.',
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
      },
      currentTrack: {
        title: 'Night Drive',
        author: 'Nova',
        duration: '4:02',
        thumbnail: 'https://example.com/thumb.png',
        url: 'https://youtube.com/watch?v=night-drive',
        sourceLabel: 'YouTube',
      },
      currentProgressBar: '[=====-----]',
      upcomingTracks: [{ position: 1, title: 'Orbit', duration: '3:50' }],
      size: 1,
      durationFormatted: '3:50',
      hiddenTrackCount: 0,
      playbackStateLabel: 'tocando',
      volume: 70,
      voiceChannelName: 'Synth Room',
      repeatModeLabel: 'off',
      autoplayEnabled: true,
      session: {
        stateLabel: 'ativa',
        healthLabel: 'saudavel',
        summary: 'A sessao esta coerente e sem bloqueios operacionais neste momento.',
        persistedItemCount: 1,
        liveItemCount: 1,
        recoveryReady: false,
        manualInterventionRequired: false,
        lastRecoveryLabel: 'sucesso',
        lastRecoverySummary: '1 restaurada(s) e 0 pulada(s)',
        currentRouteLabel: 'youtube/youtube-dl',
      },
    });

    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const edit = vi.fn().mockResolvedValue(undefined);

    const handled = await handlePanelComponentInteraction(
      {
        customId: 'phx:queue:refresh:guild-1:user-1',
        user: { id: 'user-1' },
        guildId: 'guild-1',
        guild: {
          members: {
            fetch: vi.fn().mockResolvedValue({}),
          },
        },
        client: {},
        channelId: 'text-1',
        message: {
          edit,
        },
        inGuild: () => true,
        deferred: false,
        replied: false,
        deferUpdate,
      } as never,
      {
        useCases: {
          playback: {
            queue,
          },
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(deferUpdate).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: {},
      userId: 'user-1',
    });
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );
  });

  it('applies config toggles and re-renders the config panel in place', async () => {
    const setAutoplay = vi.fn().mockResolvedValue({
      kind: 'notice',
    });
    const configView = vi.fn().mockResolvedValue({
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
      },
      settings: {
        prefix: '!',
        defaultVolume: 70,
        autoplayEnabled: true,
        resumeQueueEnabled: true,
      },
      sessionDiagnostics: createSessionDiagnostics(),
      liveVolume: 70,
    });
    const deferUpdate = vi.fn().mockResolvedValue(undefined);
    const edit = vi.fn().mockResolvedValue(undefined);

    const handled = await handlePanelComponentInteraction(
      {
        customId: 'phx:config:autoplay-enable:guild-1:user-1',
        user: { id: 'user-1' },
        guildId: 'guild-1',
        guild: {
          members: {
            fetch: vi.fn().mockResolvedValue({
              permissions: {
                has: () => true,
              },
            }),
          },
        },
        client: {},
        channelId: 'text-1',
        message: {
          edit,
        },
        inGuild: () => true,
        deferred: false,
        replied: false,
        deferUpdate,
      } as never,
      {
        player: {
          nodes: {
            get: vi.fn().mockReturnValue({
              node: {
                volume: 70,
              },
            }),
          },
        },
        useCases: {
          admin: {
            setAutoplay,
            configView,
          },
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(setAutoplay).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: expect.anything(),
      userId: 'user-1',
      enabled: true,
    });
    expect(configView).toHaveBeenCalledWith({
      guildId: 'guild-1',
      userId: 'user-1',
      liveVolume: 70,
    });
    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        components: expect.any(Array),
      }),
    );
  });

  it('reuses the same message while toggling nowplaying state multiple times', async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    const nowPlaying = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'nowPlaying',
        title: 'PHONIX | Tocando agora',
        description: 'Primeiro estado.',
        navigation: { guildId: 'guild-1', userId: 'user-1' },
        track: {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
          url: 'https://youtube.com/watch?v=night-drive',
          sourceLabel: 'YouTube',
        },
        progressBar: '[=====-----]',
        playbackStateLabel: 'pausada',
        volume: 70,
        voiceChannelName: 'Synth Room',
        queueSize: 1,
        durationFormatted: '4:02',
        repeatModeLabel: 'off',
        autoplayEnabled: false,
        nextTrack: null,
        session: {
          stateLabel: 'ativa',
          healthLabel: 'saudavel',
          summary: 'ok',
          persistedItemCount: 1,
          liveItemCount: 1,
          recoveryReady: false,
          manualInterventionRequired: false,
          lastRecoveryLabel: 'sucesso',
          lastRecoverySummary: '1 restaurada(s) e 0 pulada(s)',
          currentRouteLabel: 'youtube/youtube-dl',
        },
      })
      .mockResolvedValueOnce({
        kind: 'nowPlaying',
        title: 'PHONIX | Tocando agora',
        description: 'Segundo estado.',
        navigation: { guildId: 'guild-1', userId: 'user-1' },
        track: {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
          url: 'https://youtube.com/watch?v=night-drive',
          sourceLabel: 'YouTube',
        },
        progressBar: '[=====-----]',
        playbackStateLabel: 'tocando',
        volume: 70,
        voiceChannelName: 'Synth Room',
        queueSize: 1,
        durationFormatted: '4:02',
        repeatModeLabel: 'off',
        autoplayEnabled: false,
        nextTrack: null,
        session: {
          stateLabel: 'ativa',
          healthLabel: 'saudavel',
          summary: 'ok',
          persistedItemCount: 1,
          liveItemCount: 1,
          recoveryReady: false,
          manualInterventionRequired: false,
          lastRecoveryLabel: 'sucesso',
          lastRecoverySummary: '1 restaurada(s) e 0 pulada(s)',
          currentRouteLabel: 'youtube/youtube-dl',
        },
      });
    const edit = vi.fn().mockResolvedValue(undefined);

    const interactionBase = {
      user: { id: 'user-1' },
      guildId: 'guild-1',
      guild: {
        members: {
          fetch: vi.fn().mockResolvedValue({}),
        },
      },
      client: {},
      channelId: 'text-1',
      message: { edit },
      inGuild: () => true,
      deferred: false,
      replied: false,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:now:pause:guild-1:user-1',
      } as never,
      {
        useCases: {
          playback: {
            pause,
            nowPlaying,
          },
        },
      } as never,
    );

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:now:resume:guild-1:user-1',
      } as never,
      {
        useCases: {
          playback: {
            resume,
            nowPlaying,
          },
        },
      } as never,
    );

    expect(pause).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('refreshes and replays library favorites from the same panel', async () => {
    const favoriteList = vi.fn().mockResolvedValue({
      kind: 'collection',
      title: 'PHONIX | Seus favoritos',
      description: 'Voce tem favoritos.',
      panel: {
        surface: 'favorites',
        guildId: 'guild-1',
        userId: 'user-1',
        contextId: null,
        hasLeadAction: true,
      },
      collectionTitle: 'Favoritos salvos',
      leadTrack: null,
      entries: [],
      hiddenEntryCount: 0,
      summaryTitle: 'Biblioteca pessoal',
      summaryLines: ['Favoritos salvos: **1**'],
      actionTitle: 'Fluxo rapido',
      actionLines: ['Use o painel para tocar o destaque.'],
      hint: 'ok',
    });
    const favoritePlayLead = vi.fn().mockResolvedValue({
      kind: 'track',
      title: 'PHONIX | Favorito em destaque tocando agora',
      description: 'ok',
      track: {
        title: 'Night Drive',
        author: 'Nova',
        duration: '4:02',
        thumbnail: 'https://example.com/thumb.png',
      },
    });
    const edit = vi.fn().mockResolvedValue(undefined);

    const interactionBase = {
      user: { id: 'user-1' },
      guildId: 'guild-1',
      guild: {
        members: {
          fetch: vi.fn().mockResolvedValue({}),
        },
      },
      client: {},
      channelId: 'text-1',
      message: { edit },
      inGuild: () => true,
      deferred: false,
      replied: false,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:library:refresh:guild-1:user-1:favorites',
      } as never,
      {
        useCases: {
          library: {
            favoriteList,
          },
        },
      } as never,
    );

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:library:play-lead:guild-1:user-1:favorites',
      } as never,
      {
        useCases: {
          library: {
            favoritePlayLead,
          },
        },
      } as never,
    );

    expect(favoriteList).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
    });
    expect(favoritePlayLead).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
    });
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('opens and plays the highlighted playlist from library panels', async () => {
    const playlistListById = vi.fn().mockResolvedValue({
      kind: 'collection',
      title: 'PHONIX | Playlist mix phonk',
      description: 'ok',
      panel: {
        surface: 'playlist',
        guildId: 'guild-1',
        userId: 'user-1',
        contextId: 'playlist-1',
        hasLeadAction: true,
      },
      collectionTitle: 'Faixas salvas',
      leadTrack: null,
      entries: [],
      hiddenEntryCount: 0,
      summaryTitle: 'Leitura da playlist',
      summaryLines: ['Playlist alvo: **mix phonk**'],
      actionTitle: 'Como agir nesta playlist',
      actionLines: ['Use o painel para tocar a playlist.'],
      hint: 'ok',
    });
    const playlistPlayById = vi.fn().mockResolvedValue({
      kind: 'track',
      title: 'PHONIX | Playlist iniciada pelo painel',
      description: 'ok',
      track: {
        title: 'Night Drive',
        author: 'Nova',
        duration: '4:02',
        thumbnail: 'https://example.com/thumb.png',
      },
    });
    const edit = vi.fn().mockResolvedValue(undefined);

    const interactionBase = {
      user: { id: 'user-1' },
      guildId: 'guild-1',
      guild: {
        members: {
          fetch: vi.fn().mockResolvedValue({}),
        },
      },
      client: {},
      channelId: 'text-1',
      message: { edit },
      inGuild: () => true,
      deferred: false,
      replied: false,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:library:open-lead:guild-1:user-1:playlist.playlist-1',
      } as never,
      {
        useCases: {
          library: {
            playlistListById,
          },
        },
      } as never,
    );

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:library:play-collection:guild-1:user-1:playlist.playlist-1',
      } as never,
      {
        useCases: {
          library: {
            playlistPlayById,
          },
        },
      } as never,
    );

    expect(playlistListById).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
      playlistId: 'playlist-1',
    });
    expect(playlistPlayById).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
      playlistId: 'playlist-1',
    });
    expect(edit).toHaveBeenCalledTimes(2);
  });

  it('navigates recover, doctor and config surfaces through repeated in-place updates', async () => {
    const doctor = vi.fn().mockResolvedValue({
      appVersion: '2.3.0',
      overallStatus: 'ok',
      slashScope: 'global',
      summary: { ok: 1, warning: 0, error: 0 },
      dashboard: {
        requestedEnabled: false,
        effectiveEnabled: false,
        baseUrl: null,
        port: 3000,
        disableReason: null,
      },
      checks: [],
      nextActions: [],
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
      },
    });
    const configView = vi.fn().mockResolvedValue({
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
      },
      settings: {
        prefix: '!',
        defaultVolume: 70,
        autoplayEnabled: false,
        resumeQueueEnabled: true,
      },
      sessionDiagnostics: createSessionDiagnostics(),
      liveVolume: 70,
    });
    const queue = vi.fn().mockResolvedValue({
      kind: 'queue',
      title: 'PHONIX | Fila ativa',
      description: 'ok',
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
      },
      currentTrack: null,
      currentProgressBar: null,
      upcomingTracks: [],
      size: 0,
      durationFormatted: '0:00',
      hiddenTrackCount: 0,
      playbackStateLabel: 'parada',
      volume: 70,
      voiceChannelName: 'Synth Room',
      repeatModeLabel: 'off',
      autoplayEnabled: false,
      session: {
        stateLabel: 'ativa',
        healthLabel: 'saudavel',
        summary: 'ok',
        persistedItemCount: 1,
        liveItemCount: 0,
        recoveryReady: false,
        manualInterventionRequired: false,
        lastRecoveryLabel: 'sucesso',
        lastRecoverySummary: '1 restaurada(s) e 0 pulada(s)',
        currentRouteLabel: 'youtube/youtube-dl',
      },
    });
    const edit = vi.fn().mockResolvedValue(undefined);

    const interactionBase = {
      user: { id: 'user-1' },
      guildId: 'guild-1',
      guild: {
        id: 'guild-1',
        members: {
          fetch: vi.fn().mockResolvedValue({
            permissions: {
              has: () => true,
            },
          }),
        },
      },
      client: {},
      channelId: 'text-1',
      message: { edit },
      inGuild: () => true,
      deferred: false,
      replied: false,
      deferUpdate: vi.fn().mockResolvedValue(undefined),
    };

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:recover:doctor:guild-1:user-1',
      } as never,
      {
        player: {
          nodes: {
            get: vi.fn().mockReturnValue({
              node: {
                volume: 70,
              },
            }),
          },
        },
        useCases: {
          admin: {
            doctor,
            configView,
          },
        },
      } as never,
    );

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:doctor:config:guild-1:user-1',
      } as never,
      {
        player: {
          nodes: {
            get: vi.fn().mockReturnValue({
              node: {
                volume: 70,
              },
            }),
          },
        },
        useCases: {
          admin: {
            doctor,
            configView,
          },
        },
      } as never,
    );

    await handlePanelComponentInteraction(
      {
        ...interactionBase,
        customId: 'phx:config:doctor:guild-1:user-1',
      } as never,
      {
        player: {
          nodes: {
            get: vi.fn().mockReturnValue({
              node: {
                volume: 70,
              },
            }),
          },
        },
        useCases: {
          admin: {
            doctor,
            configView,
          },
          playback: {
            queue,
          },
        },
      } as never,
    );

    expect(doctor).toHaveBeenCalledTimes(2);
    expect(configView).toHaveBeenCalledTimes(1);
    expect(edit).toHaveBeenCalledTimes(3);
  });
});
