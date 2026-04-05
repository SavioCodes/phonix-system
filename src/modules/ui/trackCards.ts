import type { TrackCardView } from './view-models.js';

export function toTrackCardView(track: { title: string; author: string; duration: string; thumbnail: string }): TrackCardView {
  return {
    title: track.title,
    author: track.author || 'Desconhecido',
    duration: track.duration,
    thumbnail: track.thumbnail,
  };
}
