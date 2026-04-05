import type { PrismaClient, UserFavorite } from '@prisma/client';
import type { StoredTrack } from '../../music/trackCodec.js';

export class FavoritesService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(userId: string): Promise<UserFavorite[]> {
    return this.prisma.userFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async add(userId: string, track: StoredTrack): Promise<UserFavorite> {
    return this.prisma.userFavorite.upsert({
      where: {
        userId_url: {
          userId,
          url: track.url,
        },
      },
      update: {
        title: track.title,
        author: track.author,
        thumbnail: track.thumbnail,
        duration: track.duration,
        source: track.source,
        encodedTrack: track.encodedTrack,
      },
      create: {
        userId,
        ...track,
      },
    });
  }

  public async getByIndex(userId: string, index: number): Promise<UserFavorite | null> {
    const favorites = await this.list(userId);
    return favorites.at(index - 1) ?? null;
  }

  public async removeByIndex(userId: string, index: number): Promise<UserFavorite | null> {
    const favorite = await this.getByIndex(userId, index);
    if (!favorite) {
      return null;
    }

    await this.prisma.userFavorite.delete({
      where: { id: favorite.id },
    });

    return favorite;
  }
}
