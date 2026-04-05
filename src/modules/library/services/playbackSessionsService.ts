import type {
  GuildPlaybackSession as PrismaGuildPlaybackSession,
  GuildPlaybackSessionItem as PrismaGuildPlaybackSessionItem,
  PrismaClient,
} from '@prisma/client';
import type { StoredTrack } from '../../music/trackCodec.js';

const MAX_PERSISTED_QUEUE_ITEMS = 100;

export interface StoredPlaybackSessionItem {
  position: number;
  track: StoredTrack;
}

export interface StoredPlaybackSession {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  currentTrack: StoredTrack | null;
  items: StoredPlaybackSessionItem[];
  volume: number;
  repeatMode: number;
  autoplayEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavePlaybackSessionInput {
  guildId: string;
  voiceChannelId: string;
  textChannelId: string;
  currentTrack: StoredTrack | null;
  items: StoredTrack[];
  volume: number;
  repeatMode: number;
  autoplayEnabled: boolean;
}

export class PlaybackSessionsService {
  public constructor(private readonly prisma: PrismaClient) {}

  public async list(): Promise<StoredPlaybackSession[]> {
    const sessions = await this.prisma.guildPlaybackSession.findMany({
      include: {
        items: {
          orderBy: {
            position: 'asc',
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return sessions.map((session) => mapPlaybackSession(session));
  }

  public async get(guildId: string): Promise<StoredPlaybackSession | null> {
    const session = await this.prisma.guildPlaybackSession.findUnique({
      where: { guildId },
      include: {
        items: {
          orderBy: {
            position: 'asc',
          },
        },
      },
    });

    return session ? mapPlaybackSession(session) : null;
  }

  public async save(input: SavePlaybackSessionInput): Promise<StoredPlaybackSession> {
    const items = input.items.slice(0, MAX_PERSISTED_QUEUE_ITEMS);

    return this.prisma.$transaction(async (tx) => {
      await tx.guildPlaybackSession.upsert({
        where: { guildId: input.guildId },
        update: {
          voiceChannelId: input.voiceChannelId,
          textChannelId: input.textChannelId,
          currentTrackPayload: input.currentTrack ? JSON.stringify(input.currentTrack) : null,
          volume: input.volume,
          repeatMode: input.repeatMode,
          autoplayEnabled: input.autoplayEnabled,
        },
        create: {
          guildId: input.guildId,
          voiceChannelId: input.voiceChannelId,
          textChannelId: input.textChannelId,
          currentTrackPayload: input.currentTrack ? JSON.stringify(input.currentTrack) : null,
          volume: input.volume,
          repeatMode: input.repeatMode,
          autoplayEnabled: input.autoplayEnabled,
        },
      });

      await tx.guildPlaybackSessionItem.deleteMany({
        where: {
          sessionGuildId: input.guildId,
        },
      });

      if (items.length > 0) {
        await tx.guildPlaybackSessionItem.createMany({
          data: items.map((track, index) => ({
            sessionGuildId: input.guildId,
            position: index + 1,
            trackPayload: JSON.stringify(track),
          })),
        });
      }

      const session = await tx.guildPlaybackSession.findUniqueOrThrow({
        where: { guildId: input.guildId },
        include: {
          items: {
            orderBy: {
              position: 'asc',
            },
          },
        },
      });

      return mapPlaybackSession(session);
    });
  }

  public async clear(guildId: string) {
    await this.prisma.guildPlaybackSession.deleteMany({
      where: { guildId },
    });
  }
}

type PlaybackSessionRecord = PrismaGuildPlaybackSession & {
  items: PrismaGuildPlaybackSessionItem[];
};

function mapPlaybackSession(session: PlaybackSessionRecord): StoredPlaybackSession {
  return {
    guildId: session.guildId,
    voiceChannelId: session.voiceChannelId,
    textChannelId: session.textChannelId,
    currentTrack: parseTrackPayload(session.currentTrackPayload),
    items: session.items.map((item) => ({
      position: item.position,
      track: parseRequiredTrackPayload(item.trackPayload),
    })),
    volume: session.volume,
    repeatMode: session.repeatMode,
    autoplayEnabled: session.autoplayEnabled,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function parseTrackPayload(payload: string | null): StoredTrack | null {
  if (!payload) {
    return null;
  }

  const parsed = JSON.parse(payload) as StoredTrack;
  return parsed;
}

function parseRequiredTrackPayload(payload: string) {
  const parsed = parseTrackPayload(payload);
  if (!parsed) {
    throw new Error('Payload de faixa persistida invalido.');
  }

  return parsed;
}
