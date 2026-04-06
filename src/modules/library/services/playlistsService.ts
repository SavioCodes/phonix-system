import type { Playlist, PlaylistItem, PrismaClient } from '@prisma/client';
import type { StoredTrack } from '../../music/trackCodec.js';

const PLAYLIST_ITEM_LIMIT = 100;

export class PlaylistLimitError extends Error {
  public constructor(message = 'Playlist atingiu o limite de 100 faixas.') {
    super(message);
    this.name = 'PlaylistLimitError';
  }
}

export class PlaylistAlreadyExistsError extends Error {
  public constructor(message = 'Ja existe uma playlist com esse nome.') {
    super(message);
    this.name = 'PlaylistAlreadyExistsError';
  }
}

export class PlaylistsService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(userId: string, name: string): Promise<Playlist> {
    const normalizedName = normalizePlaylistName(name);
    const existing = await this.getByName(userId, normalizedName);
    if (existing) {
      throw new PlaylistAlreadyExistsError();
    }

    return this.prisma.playlist.create({
      data: {
        userId,
        name: normalizedName,
      },
    });
  }

  public async delete(userId: string, name: string): Promise<Playlist | null> {
    const playlist = await this.getByName(userId, name);
    if (!playlist) {
      return null;
    }

    return this.prisma.playlist.delete({
      where: { id: playlist.id },
    });
  }

  public async list(userId: string): Promise<Playlist[]> {
    return this.prisma.playlist.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  public async getByName(userId: string, name: string): Promise<Playlist | null> {
    const normalizedName = normalizePlaylistName(name);

    return this.prisma.playlist.findUnique({
      where: {
        userId_name: {
          userId,
          name: normalizedName,
        },
      },
    });
  }

  public async getById(userId: string, id: string): Promise<Playlist | null> {
    return this.prisma.playlist.findFirst({
      where: {
        id,
        userId,
      },
    });
  }

  public async listItems(userId: string, name: string): Promise<PlaylistItem[] | null> {
    const playlist = await this.getByName(userId, name);
    if (!playlist) {
      return null;
    }

    return this.prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    });
  }

  public async listItemsById(userId: string, id: string): Promise<PlaylistItem[] | null> {
    const playlist = await this.getById(userId, id);
    if (!playlist) {
      return null;
    }

    return this.prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    });
  }

  public async addTrack(userId: string, name: string, track: StoredTrack): Promise<PlaylistItem | null> {
    const playlist = await this.getByName(userId, name);
    if (!playlist) {
      return null;
    }

    const count = await this.prisma.playlistItem.count({
      where: { playlistId: playlist.id },
    });

    if (count >= PLAYLIST_ITEM_LIMIT) {
      throw new PlaylistLimitError();
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.playlistItem.create({
        data: {
          playlistId: playlist.id,
          position: count + 1,
          ...track,
        },
      });

      await tx.playlist.update({
        where: { id: playlist.id },
        data: { updatedAt: new Date() },
      });

      return item;
    });
  }

  public async removeTrack(userId: string, name: string, index: number): Promise<PlaylistItem | null> {
    const playlist = await this.getByName(userId, name);
    if (!playlist) {
      return null;
    }

    const items = await this.prisma.playlistItem.findMany({
      where: { playlistId: playlist.id },
      orderBy: { position: 'asc' },
    });

    const target = items.at(index - 1);
    if (!target) {
      return null;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.playlistItem.delete({
        where: { id: target.id },
      });

      const remaining = items.filter((item) => item.id !== target.id);
      await Promise.all(
        remaining.map((item, itemIndex) =>
          tx.playlistItem.update({
            where: { id: item.id },
            data: { position: itemIndex + 1 },
          }),
        ),
      );

      await tx.playlist.update({
        where: { id: playlist.id },
        data: { updatedAt: new Date() },
      });
    });

    return target;
  }
}

function normalizePlaylistName(name: string) {
  const normalized = name.trim();

  if (!normalized) {
    throw new Error('Informe um nome valido para a playlist.');
  }

  return normalized;
}
