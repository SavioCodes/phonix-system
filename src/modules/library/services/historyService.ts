import type { PrismaClient, TrackHistory } from '@prisma/client';
import type { StoredTrack } from '../../music/trackCodec.js';

const HISTORY_LIMIT = 20;

export class HistoryService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async record(userId: string, guildId: string, track: StoredTrack): Promise<void> {
    await this.prisma.trackHistory.create({
      data: {
        userId,
        guildId,
        title: track.title,
        url: track.url,
        author: track.author,
        thumbnail: track.thumbnail,
        duration: track.duration,
        source: track.source,
      },
    });

    const overflow = await this.prisma.trackHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      skip: HISTORY_LIMIT,
      select: { id: true },
    });

    if (overflow.length > 0) {
      await this.prisma.trackHistory.deleteMany({
        where: {
          id: {
            in: overflow.map((item) => item.id),
          },
        },
      });
    }
  }

  public async list(userId: string): Promise<TrackHistory[]> {
    return this.prisma.trackHistory.findMany({
      where: { userId },
      orderBy: { playedAt: 'desc' },
      take: HISTORY_LIMIT,
    });
  }
}
