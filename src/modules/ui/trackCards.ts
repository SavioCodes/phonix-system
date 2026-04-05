import type { TrackCardView } from './view-models.js';

export function toTrackCardView(
  track: { title: string; author: string; duration: string; thumbnail: string; url?: string | null },
  options: { sourceLabel?: string | null } = {},
): TrackCardView {
  return {
    title: track.title,
    author: track.author || 'Desconhecido',
    duration: track.duration,
    thumbnail: track.thumbnail,
    url: typeof track.url === 'string' && track.url.length > 0 ? track.url : null,
    sourceLabel: options.sourceLabel ?? null,
  };
}

export function formatSourceLabel(
  source: string | null | undefined,
  options: { routeKind?: 'native' | 'bridge' | 'unknown' } = {},
) {
  const normalized = (source ?? '').toLowerCase();

  if (normalized.includes('youtube')) {
    return 'YouTube';
  }

  if (normalized.includes('spotify')) {
    return options.routeKind === 'native' ? 'Spotify' : 'Spotify (bridge)';
  }

  if (normalized.includes('soundcloud')) {
    return options.routeKind === 'bridge' ? 'SoundCloud (fallback interno)' : 'SoundCloud';
  }

  return null;
}
