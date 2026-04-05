import { Track, decode, deserialize, encode } from 'discord-player';

export interface StoredTrack {
  title: string;
  url: string;
  author: string;
  thumbnail: string;
  duration: string;
  source: string;
  encodedTrack: string;
}

export function serializeTrack(track: Track): StoredTrack {
  return {
    title: track.title,
    url: track.url,
    author: track.author,
    thumbnail: track.thumbnail,
    duration: track.duration,
    source: String(track.raw?.source ?? track.raw?.engine ?? track.queryType ?? track.extractor?.identifier ?? 'unknown'),
    encodedTrack: encode(track.serialize()),
  };
}

export function restoreTrack(player: Track['player'], storedTrack: StoredTrack): Track | string {
  try {
    return deserialize(player, decode(storedTrack.encodedTrack)) as Track;
  } catch {
    return storedTrack.url;
  }
}
