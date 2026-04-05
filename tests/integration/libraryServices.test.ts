import { PrismaClient } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FavoritesService } from '../../src/modules/library/services/favoritesService.js';
import { GuildSettingsService } from '../../src/modules/library/services/guildSettingsService.js';
import { HistoryService } from '../../src/modules/library/services/historyService.js';
import { PlaybackSessionsService } from '../../src/modules/library/services/playbackSessionsService.js';
import { PlaylistAlreadyExistsError, PlaylistsService } from '../../src/modules/library/services/playlistsService.js';
import { cleanupSqliteTestDatabase, createPreparedSqliteTestDatabase } from '../support/sqliteTestHarness.js';

describe('library services integration', () => {
  let prisma: PrismaClient | undefined;
  let tempDir: string;

  beforeEach(async () => {
    const database = await createPreparedSqliteTestDatabase('phonix-test-');
    tempDir = database.tempDir;
    prisma = database.prismaClient;
  });

  afterEach(async () => {
    await cleanupSqliteTestDatabase(prisma, tempDir);
    prisma = undefined;
  });

  it('persists favorites, playlists, history and guild settings', async () => {
    const db = prisma!;
    const favorites = new FavoritesService(db);
    const playlists = new PlaylistsService(db);
    const history = new HistoryService(db);
    const guildSettings = new GuildSettingsService(db);
    const playbackSessions = new PlaybackSessionsService(db);

    const storedTrack = {
      title: 'Neon Blade',
      url: 'https://youtube.com/watch?v=abc123',
      author: 'MoonDeity',
      thumbnail: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      duration: '2:47',
      source: 'youtube',
      encodedTrack: 'encoded-track',
    };

    await favorites.add('user-1', storedTrack);
    expect((await favorites.list('user-1')).length).toBe(1);

    await playlists.create('user-1', 'mix phonk');
    await playlists.addTrack('user-1', 'mix phonk', storedTrack);
    expect((await playlists.listItems('user-1', 'mix phonk'))?.length).toBe(1);

    await history.record('user-1', 'guild-1', storedTrack);
    expect((await history.list('user-1')).length).toBe(1);

    expect(await guildSettings.getPrefix('guild-1')).toBe('!');
    await guildSettings.setPrefix('guild-1', '?');
    expect(await guildSettings.getPrefix('guild-1')).toBe('?');

    expect(await guildSettings.getDefaultVolume('guild-1')).toBe(70);
    await guildSettings.setDefaultVolume('guild-1', 88);
    expect(await guildSettings.getDefaultVolume('guild-1')).toBe(88);

    await guildSettings.setAutoplay('guild-1', true);
    expect(await guildSettings.isAutoplayEnabled('guild-1')).toBe(true);

    expect(await guildSettings.isResumeQueueEnabled('guild-1')).toBe(true);
    await guildSettings.setResumeQueue('guild-1', false);
    expect(await guildSettings.isResumeQueueEnabled('guild-1')).toBe(false);

    await playbackSessions.save({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      currentTrack: storedTrack,
      items: [storedTrack],
      volume: 88,
      repeatMode: 0,
      autoplayEnabled: false,
    });
    expect(await playbackSessions.get('guild-1')).toMatchObject({
      guildId: 'guild-1',
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      volume: 88,
      repeatMode: 0,
      autoplayEnabled: false,
      items: [
        {
          position: 1,
          track: {
            title: 'Neon Blade',
          },
        },
      ],
    });

    expect(await guildSettings.getSettings('guild-1')).toMatchObject({
      guildId: 'guild-1',
      prefix: '?',
      defaultVolume: 88,
      autoplayEnabled: true,
      resumeQueueEnabled: false,
    });
  }, 20_000);

  it('normalizes playlist names and rejects duplicate creations with a friendly domain error', async () => {
    const db = prisma!;
    const playlists = new PlaylistsService(db);

    const created = await playlists.create('user-1', '  mix phonk  ');
    expect(created.name).toBe('mix phonk');

    await expect(playlists.create('user-1', 'mix phonk')).rejects.toBeInstanceOf(PlaylistAlreadyExistsError);
    expect(await playlists.getByName('user-1', '  mix phonk  ')).toMatchObject({
      name: 'mix phonk',
    });
  }, 20_000);

  it('updates, orders and clears persisted playback sessions', async () => {
    const db = prisma!;
    const playbackSessions = new PlaybackSessionsService(db);

    const trackA = {
      title: 'Track A',
      url: 'https://youtube.com/watch?v=track-a',
      author: 'Artist A',
      thumbnail: 'https://img.youtube.com/a.jpg',
      duration: '3:11',
      source: 'youtube',
      encodedTrack: 'encoded-a',
    };

    const trackB = {
      title: 'Track B',
      url: 'https://youtube.com/watch?v=track-b',
      author: 'Artist B',
      thumbnail: 'https://img.youtube.com/b.jpg',
      duration: '3:45',
      source: 'youtube',
      encodedTrack: 'encoded-b',
    };

    await playbackSessions.save({
      guildId: 'guild-2',
      voiceChannelId: 'voice-2',
      textChannelId: 'text-2',
      currentTrack: trackA,
      items: [trackB, trackA],
      volume: 77,
      repeatMode: 2,
      autoplayEnabled: false,
    });

    expect(await playbackSessions.get('guild-2')).toMatchObject({
      currentTrack: {
        title: 'Track A',
      },
      items: [
        { position: 1, track: { title: 'Track B' } },
        { position: 2, track: { title: 'Track A' } },
      ],
    });

    await playbackSessions.save({
      guildId: 'guild-2',
      voiceChannelId: 'voice-3',
      textChannelId: 'text-3',
      currentTrack: trackB,
      items: [trackA],
      volume: 65,
      repeatMode: 0,
      autoplayEnabled: true,
    });

    expect(await playbackSessions.get('guild-2')).toMatchObject({
      voiceChannelId: 'voice-3',
      textChannelId: 'text-3',
      currentTrack: {
        title: 'Track B',
      },
      items: [{ position: 1, track: { title: 'Track A' } }],
      volume: 65,
      repeatMode: 0,
      autoplayEnabled: true,
    });

    await playbackSessions.clear('guild-2');
    expect(await playbackSessions.get('guild-2')).toBeNull();
  }, 20_000);
});
