import { describe, expect, it, vi } from 'vitest';
import { createLibraryUseCases } from '../../src/modules/library/use-cases/libraryUseCases.js';

describe('library use cases', () => {
  it('favoriteAdd throws a friendly error when there is no query and no current track', async () => {
    const useCases = createLibraryUseCases({
      player: {
        search: vi.fn(),
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensureSameVoiceChannel: vi.fn(),
        resolveSearchEngine: vi.fn(),
      } as never,
      favorites: {
        add: vi.fn(),
      } as never,
      playlists: {} as never,
      history: {} as never,
    });

    await expect(
      useCases.favoriteAdd({
        guildId: 'guild-1',
        user: { id: 'user-1' } as never,
        member: {} as never,
        metadata: { textChannelId: 'text-1' },
        queue: undefined,
        query: undefined,
      }),
    ).rejects.toThrow(/Nada tocando agora\. Informe uma busca ou URL para salvar/i);
  });

  it('playlistCreate returns the normalized playlist name emitted by the service', async () => {
    const create = vi.fn().mockResolvedValue({ name: 'mix phonk' });
    const useCases = createLibraryUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {} as never,
      favorites: {} as never,
      playlists: {
        create,
      } as never,
      history: {} as never,
    });

    const result = await useCases.playlistCreate({
      guildId: 'guild-1',
      user: { id: 'user-1' } as never,
      member: {} as never,
      metadata: { textChannelId: 'text-1' },
      name: '  mix phonk  ',
    });

    expect(result.kind).toBe('notice');
    expect(result.description).toContain('**mix phonk**');
    expect(result.fields?.some((field) => field.name === 'Nome salvo' && field.value.includes('mix phonk'))).toBe(true);
    expect(create).toHaveBeenCalledWith('user-1', '  mix phonk  ');
  });

  it('favoritePlay validates the playable voice channel before queueing the stored track', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1', name: 'synth-room' });
    const playStoredTracks = vi.fn().mockResolvedValue({
      queue: {
        currentTrack: {
          url: 'https://example.com/track-1',
        },
      },
      track: {
        title: 'Night Drive',
        author: 'Nova',
        duration: '4:02',
        thumbnail: 'https://example.com/thumb.png',
        url: 'https://example.com/track-1',
      },
    });

    const useCases = createLibraryUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
        playStoredTracks,
      } as never,
      favorites: {
        getByIndex: vi.fn().mockResolvedValue({
          title: 'Night Drive',
          url: 'https://example.com/track-1',
          author: 'Nova',
          thumbnail: 'https://example.com/thumb.png',
          duration: '4:02',
          source: 'youtube',
          encodedTrack: 'encoded-track',
        }),
      } as never,
      playlists: {} as never,
      history: {} as never,
    });

    const member = {
      id: 'member-1',
    } as never;
    const user = {
      id: 'user-1',
    } as never;

    const result = await useCases.favoritePlay({
      guildId: 'guild-1',
      user,
      member,
      metadata: { textChannelId: 'text-1' },
      index: 1,
    });

    expect(ensurePlayableVoiceChannel).toHaveBeenCalledWith(member);
    expect(playStoredTracks).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('track');
    expect(result.title).toBe('PHONIX | Favorito tocando agora');
  });

  it('favoriteAdd returns a richer track notice with origin and next step context', async () => {
    const search = vi.fn().mockResolvedValue({
      isEmpty: () => false,
      tracks: [
        {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
          url: 'https://example.com/track-1',
          raw: { source: 'youtube' },
          serialize: () => 'serialized-track',
        },
      ],
    });
    const add = vi.fn().mockResolvedValue(undefined);

    const useCases = createLibraryUseCases({
      player: {
        search,
      } as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        resolveSearchEngine: vi.fn().mockReturnValue('ext:youtube'),
      } as never,
      favorites: {
        add,
      } as never,
      playlists: {} as never,
      history: {} as never,
    });

    const result = await useCases.favoriteAdd({
      guildId: 'guild-1',
      user: { id: 'user-1' } as never,
      member: {} as never,
      metadata: { textChannelId: 'text-1' },
      query: 'night drive',
    });

    expect(result.kind).toBe('track');
    if (result.kind !== 'track') {
      throw new Error('Expected track result.');
    }

    expect(result.fields?.some((field) => field.name === 'Origem do atalho' && field.value.includes('Busca ou URL'))).toBe(true);
    expect(result.hint).toContain('/playlist add');
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('playlistPlay returns playlist context and session guidance in the track notice', async () => {
    const ensurePlayableVoiceChannel = vi.fn().mockResolvedValue({ id: 'voice-1', name: 'Synth Room' });
    const playStoredTracks = vi.fn().mockResolvedValue({
      queue: {
        currentTrack: null,
      },
      track: {
        title: 'Night Drive',
        author: 'Nova',
        duration: '4:02',
        thumbnail: 'https://example.com/thumb.png',
        url: 'https://example.com/track-1',
      },
    });

    const useCases = createLibraryUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {
        ensurePlayableVoiceChannel,
        playStoredTracks,
      } as never,
      favorites: {} as never,
      playlists: {
        listItems: vi.fn().mockResolvedValue([
          {
            position: 1,
            title: 'Night Drive',
            url: 'https://example.com/track-1',
            author: 'Nova',
            thumbnail: 'https://example.com/thumb.png',
            duration: '4:02',
            source: 'youtube',
            encodedTrack: 'encoded-1',
          },
          {
            position: 2,
            title: 'Orbit',
            url: 'https://example.com/track-2',
            author: 'Nova',
            thumbnail: 'https://example.com/thumb2.png',
            duration: '3:50',
            source: 'youtube',
            encodedTrack: 'encoded-2',
          },
        ]),
      } as never,
      history: {} as never,
    });

    const result = await useCases.playlistPlay({
      guildId: 'guild-1',
      user: { id: 'user-1' } as never,
      member: { id: 'member-1' } as never,
      metadata: { textChannelId: 'text-1' },
      name: 'mix phonk',
    });

    expect(result.kind).toBe('track');
    if (result.kind !== 'track') {
      throw new Error('Expected track result.');
    }

    expect(result.fields?.some((field) => field.name === 'Playlist chamada' && field.value.includes('2'))).toBe(true);
    expect(result.hint).toContain('/queue');
    expect(ensurePlayableVoiceChannel).toHaveBeenCalled();
    expect(playStoredTracks).toHaveBeenCalledTimes(1);
  });

  it('favoriteList returns a collection panel with media metadata when favorites exist', async () => {
    const useCases = createLibraryUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {} as never,
      favorites: {
        list: vi.fn().mockResolvedValue([
          {
            title: 'Night Drive',
            author: 'Nova',
            url: 'https://example.com/track-1',
            thumbnail: 'https://example.com/thumb.png',
            duration: '4:02',
            source: 'youtube',
          },
        ]),
      } as never,
      playlists: {} as never,
      history: {} as never,
    });

    const result = await useCases.favoriteList({
      guildId: 'guild-1',
      user: { id: 'user-1' } as never,
      member: {} as never,
      metadata: { textChannelId: 'text-1' },
    });

    expect(result.kind).toBe('collection');
    if (result.kind !== 'collection') {
      throw new Error('Expected collection result.');
    }

    expect(result.collectionTitle).toBe('Favoritos salvos');
    expect(result.panel).toMatchObject({
      surface: 'favorites',
      guildId: 'guild-1',
      userId: 'user-1',
      hasLeadAction: true,
    });
    expect(result.leadTrack?.title).toBe('Night Drive');
    expect(result.leadTrack?.sourceLabel).toBe('YouTube');
    expect(result.entries[0]).toMatchObject({
      position: 1,
      title: 'Night Drive',
      sourceLabel: 'YouTube',
    });
    expect(result.actionLines.some((line) => line.includes('/favorite play'))).toBe(true);
  });

  it('history returns a structured reuse guide alongside the recent items list', async () => {
    const useCases = createLibraryUseCases({
      player: {} as never,
      ffmpeg: {
        available: true,
        executable: 'ffmpeg',
        detail: 'ok',
      },
      music: {} as never,
      favorites: {} as never,
      playlists: {} as never,
      history: {
        list: vi.fn().mockResolvedValue([
          {
            title: 'Night Drive',
            author: 'Nova',
            url: 'https://example.com/track-1',
            thumbnail: 'https://example.com/thumb.png',
            duration: '4:02',
            source: 'youtube',
          },
          {
            title: 'Orbit',
            author: 'Nova',
            url: 'https://example.com/track-2',
            thumbnail: 'https://example.com/thumb2.png',
            duration: '3:50',
            source: 'youtube',
          },
        ]),
      } as never,
    });

    const result = await useCases.history({
      guildId: 'guild-1',
      user: { id: 'user-1' } as never,
      member: {} as never,
      metadata: { textChannelId: 'text-1' },
    });

    expect(result.kind).toBe('collection');
    if (result.kind !== 'collection') {
      throw new Error('Expected collection result.');
    }

    expect(result.collectionTitle).toBe('Ultimas reproducoes');
    expect(result.panel).toMatchObject({
      surface: 'history',
      guildId: 'guild-1',
      userId: 'user-1',
      hasLeadAction: true,
    });
    expect(result.entries.some((entry) => entry.title === 'Night Drive')).toBe(true);
    expect(result.actionLines.some((line) => line.includes('/favorite add'))).toBe(true);
    expect(result.summaryLines.some((line) => line.includes('Atalho rapido'))).toBe(true);
    expect(result.hint).toContain('destaque do painel');
  });
});
