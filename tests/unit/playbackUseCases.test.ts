import { describe, expect, it, vi } from 'vitest';
import { QueueRepeatMode } from 'discord-player';
import { createPlaybackUseCases } from '../../src/modules/music/use-cases/playbackUseCases.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

const basePlaybackEntry = {
  connection: 'A conexao de voz precisou ser preparada nesta solicitacao.',
  session: 'Esta entrada iniciou a sessao atual do PHONIX neste canal.',
  startup: 'O PHONIX aguardou o start real da faixa antes de responder.',
  runtime: null,
} as const;

describe('playback use cases', () => {
  it('play returns a dedicated play result when playback starts immediately', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1' });
    const play = vi.fn().mockResolvedValue({
      resultType: 'track',
      mode: 'queue',
      source: 'Auto',
      startedPlayback: true,
      addedCount: 1,
      requestedCount: 1,
      truncatedCount: 0,
      queuePosition: null,
      estimatedWait: null,
      voiceChannelName: 'Lofi Room',
      autoplayEnabled: false,
      hint: 'Use /queue para ver o que vem depois.',
      provider: 'youtube',
      pipeline: 'youtube-dl',
      routeKind: 'native',
      entry: {
        preparedVoiceConnection: true,
        reusedActiveQueue: false,
        awaitedPlaybackStart: true,
        compatibilityFallbackUsed: false,
      },
      queue: {
        channel: {
          id: 'voice-1',
        },
      },
      track: {
        title: 'Night Drive',
        author: 'Synthwave',
        duration: '3:45',
        thumbnail: 'thumb.png',
        url: 'https://youtube.com/watch?v=night-drive',
      },
    });
    const recordPlaybackSignal = vi.fn();

    const useCases = createPlaybackUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
        play,
      } as never,
      playbackSessionManager: {} as never,
      operationalTelemetry: {
        recordPlaybackSignal,
      } as never,
    });

    const result = await useCases.play({
      guildId: 'guild-1',
      member: {} as never,
      user: { id: 'user-1' } as never,
      metadata: { textChannelId: 'text-1' },
      query: 'night drive',
      mode: 'queue',
      source: 'auto',
      sourceContext: 'slash',
    });

    expect(result.kind).toBe('play');
    if (result.kind !== 'play') {
      throw new Error('Expected play view result.');
    }

    expect(result.title).toBe('PHONIX | Tocando agora');
    expect(result.mode).toBe('queue');
    expect(result.startedPlayback).toBe(true);
    expect(result.voiceChannelName).toBe('Lofi Room');
    expect(result.hint).toContain('/queue');
    expect(result.track.url).toBe('https://youtube.com/watch?v=night-drive');
    expect(result.track.sourceLabel).toBe('YouTube');
    expect(result.entry).toEqual(basePlaybackEntry);
    expect(recordPlaybackSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        type: 'play_request',
        textChannelId: 'text-1',
      }),
    );
    expect(play).toHaveBeenCalledWith(
      { id: 'voice-1' },
      'night drive',
      { id: 'user-1' },
      { textChannelId: 'text-1' },
      { mode: 'queue', forcedSource: 'auto' },
    );
  });

  it('play surfaces queue details when using next mode', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1' });
    const play = vi.fn().mockResolvedValue({
      resultType: 'track',
      mode: 'next',
      source: 'YouTube',
      startedPlayback: false,
      addedCount: 1,
      requestedCount: 1,
      truncatedCount: 0,
      queuePosition: 1,
      estimatedWait: '2:15',
      voiceChannelName: 'Synth Room',
      autoplayEnabled: true,
      hint: 'Use /skip se quiser ir direto para a proxima faixa agora.',
      provider: 'youtube',
      pipeline: 'youtube-dl',
      routeKind: 'native',
      entry: {
        preparedVoiceConnection: false,
        reusedActiveQueue: true,
        awaitedPlaybackStart: false,
        compatibilityFallbackUsed: false,
      },
      queue: {
        channel: {
          id: 'voice-1',
        },
      },
      track: {
        title: 'Orbit',
        author: 'Nova',
        duration: '4:00',
        thumbnail: 'thumb.png',
        url: 'https://youtube.com/watch?v=orbit',
      },
    });

    const useCases = createPlaybackUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
        play,
      } as never,
      playbackSessionManager: {} as never,
      operationalTelemetry: {
        recordPlaybackSignal: vi.fn(),
      } as never,
    });

    const result = await useCases.play({
      guildId: 'guild-1',
      member: {} as never,
      user: { id: 'user-1' } as never,
      metadata: { textChannelId: 'text-1' },
      query: 'orbit',
      mode: 'next',
      source: 'youtube',
      sourceContext: 'prefix',
    });

    expect(result.kind).toBe('play');
    if (result.kind !== 'play') {
      throw new Error('Expected play view result.');
    }

    expect(result.title).toBe('PHONIX | Faixa sera a proxima');
    expect(result.queuePosition).toBe(1);
    expect(result.estimatedWait).toBe('2:15');
    expect(result.source).toBe('YouTube');
    expect(result.autoplayEnabled).toBe(true);
    expect(result.track.sourceLabel).toBe('YouTube');
    expect(result.entry.connection).toContain('ja estava pronta');
    expect(result.entry.session).toContain('logo depois da faixa atual');
  });

  it('play makes the Spotify bridge route explicit in the result view', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1' });
    const play = vi.fn().mockResolvedValue({
      resultType: 'track',
      mode: 'queue',
      source: 'Spotify',
      startedPlayback: true,
      addedCount: 1,
      requestedCount: 1,
      truncatedCount: 0,
      queuePosition: null,
      estimatedWait: null,
      voiceChannelName: 'Night Room',
      autoplayEnabled: false,
      hint: 'Use /queue para ver a fila.',
      provider: 'spotify',
      pipeline: 'spotify-bridge',
      routeKind: 'bridge',
      entry: {
        preparedVoiceConnection: true,
        reusedActiveQueue: false,
        awaitedPlaybackStart: true,
        compatibilityFallbackUsed: false,
      },
      queue: {
        channel: {
          id: 'voice-1',
        },
      },
      track: {
        title: 'After Dark',
        author: 'Metro',
        duration: '4:12',
        thumbnail: 'thumb.png',
        url: 'https://open.spotify.com/track/after-dark',
      },
    });

    const useCases = createPlaybackUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
        play,
      } as never,
      playbackSessionManager: {} as never,
      operationalTelemetry: {
        recordPlaybackSignal: vi.fn(),
      } as never,
    });

    const result = await useCases.play({
      guildId: 'guild-1',
      member: {} as never,
      user: { id: 'user-1' } as never,
      metadata: { textChannelId: 'text-1' },
      query: 'after dark',
      mode: 'queue',
      source: 'spotify',
      sourceContext: 'slash',
    });

    expect(result.kind).toBe('play');
    if (result.kind !== 'play') {
      throw new Error('Expected play view result.');
    }

    expect(result.source).toBe('Spotify');
    expect(result.sourceRouteKind).toBe('bridge');
    expect(result.sourceDetail).toContain('bridge');
    expect(result.description).toContain('source original');
    expect(result.track.sourceLabel).toBe('Spotify (bridge)');
  });

  it('recover restores the persisted session and returns a dedicated recovery view', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1' });
    const recoverForMember = vi.fn().mockResolvedValue({
      requestedTrackCount: 4,
      recoveredTrackCount: 3,
      skippedTrackCount: 1,
      restoredCurrentTrack: false,
      restoredUpcomingTrackCount: 3,
      volume: 82,
      repeatMode: QueueRepeatMode.AUTOPLAY,
      autoplayEnabled: true,
      sessionHealth: 'partial',
      healthDetail: 'Parte da sessao voltou, mas nem todas as faixas salvas continuaram tocaveis.',
      manualInterventionRequired: false,
      autoRecovered: false,
      attemptCount: 1,
    });

    const useCases = createPlaybackUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
      } as never,
      playbackSessionManager: {
        recoverForMember,
      } as never,
      operationalTelemetry: {} as never,
    });

    const member = { id: 'member-1' } as never;
    const user = { id: 'user-1' } as never;
    const metadata = { textChannelId: 'text-1' };
    const result = await useCases.recover({
      guildId: 'guild-1',
      member,
      user,
      metadata,
    });

    expect(result.kind).toBe('recover');
    if (result.kind !== 'recover') {
      throw new Error('Expected recover result.');
    }
    expect(result.variant).toBe('warning');
    expect(result.description).toContain('**3** de **4** faixa(s)');
    expect(result.summaryLines.some((line) => line.includes('Puladas: **1**'))).toBe(true);
    expect(result.settingsLines.some((line) => line.includes('82%'))).toBe(true);
    expect(result.sessionLines.some((line) => line.includes('parcial'))).toBe(true);
    expect(result.hint).toContain('/queue');
    expect(ensurePlayableVoiceChannel).toHaveBeenCalledWith(member);
    expect(recoverForMember).toHaveBeenCalledWith(member, metadata, user);
  });

  it('recover translates a missing saved session into a titled precondition error', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1' });
    const recoverForMember = vi.fn().mockRejectedValue(new Error('Nao existe sessao pendente para recuperar neste servidor.'));

    const useCases = createPlaybackUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
      } as never,
      playbackSessionManager: {
        recoverForMember,
      } as never,
      operationalTelemetry: {} as never,
    });

    await expect(
      useCases.recover({
        guildId: 'guild-1',
        member: {} as never,
        user: { id: 'user-1' } as never,
        metadata: { textChannelId: 'text-1' },
      }),
    ).rejects.toMatchObject({
      title: 'Nenhuma sessao pendente',
      message: 'Nao existe sessao pendente para recuperar neste servidor.',
    });
  });

  it('queue returns a stable queue view DTO for the presentation layer', async () => {
    const ensureSameVoiceChannel = vi.fn();
    const queue = {
      currentTrack: {
        title: 'Track atual',
        author: 'Autor',
        duration: '3:21',
        thumbnail: 'thumb.png',
        url: 'https://youtube.com/watch?v=track-atual',
        raw: { source: 'youtube' },
      },
      tracks: {
        toArray: () => [
          { title: 'Fila 1', duration: '2:10' },
          { title: 'Fila 2', duration: '4:05' },
        ],
        at: (index: number) =>
          [
            { title: 'Fila 1', duration: '2:10' },
            { title: 'Fila 2', duration: '4:05' },
          ][index] ?? null,
      },
      size: 2,
      durationFormatted: '6:15',
      channel: {
        id: 'voice-1',
        name: 'Synth Room',
      },
      node: {
        volume: 70,
        createProgressBar: vi.fn().mockReturnValue('[=====-----]'),
      },
      repeatMode: QueueRepeatMode.AUTOPLAY,
    };

    const useCases = createPlaybackUseCases({
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(queue),
        },
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel,
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(
          createSessionDiagnostics({
            state: 'active',
            health: 'partial',
            healthDetail: 'A sessao voltou a tocar, mas 1 faixa ficou de fora durante o recovery.',
            hasPersistedSession: true,
            hasActiveQueue: true,
            itemCount: 3,
            liveItemCount: 3,
            hasCurrentTrack: true,
            lastRecoveryStatus: 'success',
            lastRecoveryRecoveredTrackCount: 2,
            lastRecoverySkippedTrackCount: 1,
          }),
        ),
      } as never,
      operationalTelemetry: {} as never,
    });

    const result = await useCases.queue({
      guildId: 'guild-1',
      member: {} as never,
    });

    expect(result.kind).toBe('queue');
    if (result.kind !== 'queue') {
      throw new Error('Expected queue view result.');
    }

    expect(result.upcomingTracks).toEqual([
      { position: 1, title: 'Fila 1', duration: '2:10' },
      { position: 2, title: 'Fila 2', duration: '4:05' },
    ]);
    expect(result.currentTrack?.title).toBe('Track atual');
    expect(result.currentTrack?.url).toBe('https://youtube.com/watch?v=track-atual');
    expect(result.currentTrack?.sourceLabel).toBe('YouTube');
    expect(result.currentProgressBar).toBe('[=====-----]');
    expect(result.voiceChannelName).toBe('Synth Room');
    expect(result.repeatModeLabel).toBe('autoplay');
    expect(result.autoplayEnabled).toBe(true);
    expect(result.session.healthLabel).toBe('parcial');
    expect(result.session.currentRouteLabel).toContain('youtube');
    expect(ensureSameVoiceChannel).toHaveBeenCalled();
  });

  it('nowPlaying returns a stable focused session DTO with next track context', async () => {
    const ensureSameVoiceChannel = vi.fn();
    const queue = {
      currentTrack: {
        title: 'Track atual',
        author: 'Autor',
        duration: '3:21',
        thumbnail: 'thumb.png',
        url: 'https://youtube.com/watch?v=track-atual',
        raw: { source: 'youtube' },
      },
      tracks: {
        at: (index: number) =>
          [{ title: 'Fila 1', duration: '2:10' }][index] ?? null,
      },
      size: 1,
      durationFormatted: '2:10',
      channel: {
        id: 'voice-1',
        name: 'Synth Room',
      },
      node: {
        volume: 55,
        createProgressBar: vi.fn().mockReturnValue('[====------]'),
      },
      repeatMode: QueueRepeatMode.OFF,
    };

    const useCases = createPlaybackUseCases({
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(queue),
        },
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel,
      } as never,
      playbackSessionManager: {
        getDiagnostics: vi.fn().mockResolvedValue(
          createSessionDiagnostics({
            state: 'active',
            health: 'healthy',
            healthDetail: 'Fila ao vivo com 2 faixa(s) rastreadas nesta guild.',
            hasPersistedSession: true,
            hasActiveQueue: true,
            itemCount: 2,
            liveItemCount: 2,
            hasCurrentTrack: true,
            lastRecoveryStatus: 'success',
            lastRecoveryRecoveredTrackCount: 2,
          }),
        ),
      } as never,
      operationalTelemetry: {} as never,
    });

    const result = await useCases.nowPlaying({
      guildId: 'guild-1',
      member: {} as never,
    });

    expect(result.kind).toBe('nowPlaying');
    if (result.kind !== 'nowPlaying') {
      throw new Error('Expected nowPlaying view result.');
    }

    expect(result.track?.title).toBe('Track atual');
    expect(result.track?.url).toBe('https://youtube.com/watch?v=track-atual');
    expect(result.track?.sourceLabel).toBe('YouTube');
    expect(result.progressBar).toBe('[====------]');
    expect(result.nextTrack).toEqual({ position: 1, title: 'Fila 1', duration: '2:10' });
    expect(result.session.healthLabel).toBe('saudavel');
    expect(result.session.currentRouteLabel).toContain('youtube');
    expect(ensureSameVoiceChannel).toHaveBeenCalled();
  });

  it('stop clears the persisted session, deletes the live queue and records a leave signal', async () => {
    const ensureSameVoiceChannel = vi.fn();
    const queueDelete = vi.fn();
    const clearSessionForCommand = vi.fn().mockResolvedValue(undefined);
    const recordPlaybackSignal = vi.fn();
    const queue = {
      currentTrack: {
        title: 'Track atual',
      },
      size: 2,
      channel: {
        id: 'voice-1',
        name: 'Synth Room',
      },
      node: {
        volume: 70,
      },
      delete: queueDelete,
    };

    const useCases = createPlaybackUseCases({
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(queue),
        },
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel,
      } as never,
      playbackSessionManager: {
        clearSessionForCommand,
      } as never,
      operationalTelemetry: {
        recordPlaybackSignal,
      } as never,
    });

    const result = await useCases.stop({
      guildId: 'guild-1',
      member: {} as never,
      metadata: { textChannelId: 'text-1' },
    });

    expect(result.kind).toBe('notice');
    if (result.kind !== 'notice') {
      throw new Error('Expected notice result.');
    }
    expect(result.fields?.some((field) => field.name === 'Persistencia' && field.value.includes('snapshot salvo'))).toBe(true);
    expect(clearSessionForCommand).toHaveBeenCalledWith('guild-1', 'manualStop');
    expect(queueDelete).toHaveBeenCalledTimes(1);
    expect(recordPlaybackSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        type: 'leave',
        textChannelId: 'text-1',
      }),
    );
  });

  it('volume returns a guided informational notice when no new value is provided', async () => {
    const ensureSameVoiceChannel = vi.fn();
    const queue = {
      currentTrack: {
        title: 'Track atual',
      },
      size: 2,
      channel: {
        id: 'voice-1',
        name: 'Synth Room',
      },
      node: {
        volume: 70,
      },
    };

    const useCases = createPlaybackUseCases({
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(queue),
        },
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel,
      } as never,
      playbackSessionManager: {} as never,
      operationalTelemetry: {} as never,
    });

    const result = await useCases.volume({
      guildId: 'guild-1',
      member: {} as never,
    });

    expect(result.kind).toBe('notice');
    if (result.kind !== 'notice') {
      throw new Error('Expected notice result.');
    }
    expect(result.fields?.some((field) => field.name === 'Faixa segura' && field.value.includes('150'))).toBe(true);
    expect(result.hint).toContain('/volume 80');
    expect(ensureSameVoiceChannel).toHaveBeenCalled();
  });

  it('loop updates only the live queue repeat mode', async () => {
    const ensureSameVoiceChannel = vi.fn();
    const setRepeatMode = vi.fn();
    const queue = {
      currentTrack: {
        title: 'Track atual',
      },
      size: 1,
      repeatMode: QueueRepeatMode.OFF,
      channel: {
        id: 'voice-1',
      },
      node: {
        volume: 70,
      },
      setRepeatMode,
    };
    const useCases = createPlaybackUseCases({
      player: {
        nodes: {
          get: vi.fn().mockReturnValue(queue),
        },
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel,
      } as never,
      playbackSessionManager: {} as never,
      operationalTelemetry: {} as never,
    });

    const result = await useCases.loop({
      guildId: 'guild-1',
      member: {} as never,
      mode: 'queue',
    });

    expect(result.kind).toBe('notice');
    if (result.kind !== 'notice') {
      throw new Error('Expected notice result.');
    }
    expect(result.description).toContain('**repetir fila**');
    expect(result.fields?.some((field) => field.name === 'Modo aplicado' && field.value.includes('repetir fila'))).toBe(true);
    expect(result.hint).toContain('/queue');
    expect(setRepeatMode).toHaveBeenCalledWith(QueueRepeatMode.QUEUE);
    expect(ensureSameVoiceChannel).toHaveBeenCalled();
  });
});
