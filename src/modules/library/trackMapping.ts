import type { PlaylistItem, UserFavorite } from '@prisma/client';
import type { StoredTrack } from '../music/trackCodec.js';

export function favoriteRecordToStoredTrack(favorite: UserFavorite): StoredTrack {
  return {
    title: favorite.title,
    url: favorite.url,
    author: favorite.author,
    thumbnail: favorite.thumbnail,
    duration: favorite.duration,
    source: favorite.source,
    encodedTrack: favorite.encodedTrack,
  };
}

export function playlistItemRecordToStoredTrack(item: PlaylistItem): StoredTrack {
  return {
    title: item.title,
    url: item.url,
    author: item.author,
    thumbnail: item.thumbnail,
    duration: item.duration,
    source: item.source,
    encodedTrack: item.encodedTrack,
  };
}
