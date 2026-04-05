import type { GuildQueue, Track } from 'discord-player';
import type { QueueMetadata } from './musicService.js';

export type PlaybackFailureStage =
  | 'command'
  | 'join'
  | 'connect'
  | 'play'
  | 'stream'
  | 'player'
  | 'queue'
  | 'voice'
  | 'recovery'
  | 'lifecycle';

export type PlaybackFailureCode =
  | 'search_no_result'
  | 'unsupported_url'
  | 'queue_capacity_reached'
  | 'voice_connection_timeout'
  | 'voice_connection_destroyed'
  | 'voice_disconnected'
  | 'voice_empty_channel'
  | 'stream_no_result'
  | 'stream_unavailable'
  | 'extractor_failure'
  | 'playback_unavailable'
  | 'permission_missing'
  | 'ffmpeg_unavailable'
  | 'spotify_not_configured'
  | 'queue_runtime_error'
  | 'player_runtime_error'
  | 'unexpected_runtime'
  | 'recovery_failed'
  | 'recovery_exhausted'
  | 'recovery_aborted'
  | 'command_validation'
  | 'command_authorization'
  | 'command_precondition'
  | 'command_conflict'
  | 'command_dependency'
  | 'command_infrastructure';

export type PlaybackProvider = 'youtube' | 'spotify' | 'soundcloud' | 'discord-player' | 'unknown';
export type PlaybackPipeline = 'youtubei' | 'youtube-dl' | 'spotify-bridge' | 'soundcloud-extractor' | 'ffmpeg' | 'voice' | 'unknown';
export type RecoveryTrigger =
  | 'startup'
  | 'manual'
  | 'queue_error'
  | 'player_error'
  | 'connection_destroyed'
  | 'disconnect';

export interface PlaybackFaultDescriptor {
  code: PlaybackFailureCode;
  stage: PlaybackFailureStage;
  message: string;
  recoverable: boolean;
  terminal: boolean;
  provider: PlaybackProvider;
  pipeline: PlaybackPipeline;
}

export function classifyQueueError(error: unknown, queue?: GuildQueue<QueueMetadata> | null): PlaybackFaultDescriptor {
  if (isVoiceConnectionAbortError(error)) {
    return {
      code: 'voice_connection_timeout',
      stage: 'connect',
      message: getErrorMessage(error),
      recoverable: true,
      terminal: false,
      provider: inferProvider(queue?.currentTrack),
      pipeline: 'voice',
    };
  }

  if (mentionsFfmpeg(error)) {
    return {
      code: 'ffmpeg_unavailable',
      stage: 'stream',
      message: getErrorMessage(error),
      recoverable: false,
      terminal: true,
      provider: inferProvider(queue?.currentTrack),
      pipeline: 'ffmpeg',
    };
  }

  if (isTrackNoResultError(error)) {
    return {
      code: 'stream_no_result',
      stage: 'stream',
      message: getErrorMessage(error),
      recoverable: true,
      terminal: false,
      provider: inferProvider(queue?.currentTrack),
      pipeline: inferPipeline(error, queue?.currentTrack),
    };
  }

  if (isTrackUnavailableError(error)) {
    return {
      code: 'stream_unavailable',
      stage: 'stream',
      message: getErrorMessage(error),
      recoverable: true,
      terminal: false,
      provider: inferProvider(queue?.currentTrack),
      pipeline: inferPipeline(error, queue?.currentTrack),
    };
  }

  return {
    code: 'queue_runtime_error',
    stage: 'queue',
    message: getErrorMessage(error),
    recoverable: false,
    terminal: false,
    provider: inferProvider(queue?.currentTrack),
    pipeline: inferPipeline(error, queue?.currentTrack),
  };
}

export function classifyPlayerError(
  error: unknown,
  track?: Track | null,
): PlaybackFaultDescriptor {
  if (isTrackNoResultError(error)) {
    return {
      code: 'stream_no_result',
      stage: 'stream',
      message: getErrorMessage(error),
      recoverable: true,
      terminal: false,
      provider: inferProvider(track),
      pipeline: inferPipeline(error, track),
    };
  }

  if (isTrackUnavailableError(error)) {
    return {
      code: mentionsExtractor(error) ? 'extractor_failure' : 'stream_unavailable',
      stage: mentionsExtractor(error) ? 'play' : 'stream',
      message: getErrorMessage(error),
      recoverable: true,
      terminal: false,
      provider: inferProvider(track),
      pipeline: inferPipeline(error, track),
    };
  }

  return {
    code: 'player_runtime_error',
    stage: 'player',
    message: getErrorMessage(error),
    recoverable: false,
    terminal: false,
    provider: inferProvider(track),
    pipeline: inferPipeline(error, track),
  };
}

export function classifyLifecycleFault(
  kind: 'connection_destroyed' | 'disconnect' | 'empty_channel',
  queue?: GuildQueue<QueueMetadata> | null,
): PlaybackFaultDescriptor {
  if (kind === 'connection_destroyed') {
    return {
      code: 'voice_connection_destroyed',
      stage: 'voice',
      message: 'A conexao de voz da guild foi destruida inesperadamente.',
      recoverable: true,
      terminal: false,
      provider: inferProvider(queue?.currentTrack),
      pipeline: 'voice',
    };
  }

  if (kind === 'disconnect') {
    return {
      code: 'voice_disconnected',
      stage: 'voice',
      message: 'O bot foi desconectado do canal de voz.',
      recoverable: true,
      terminal: false,
      provider: inferProvider(queue?.currentTrack),
      pipeline: 'voice',
    };
  }

  return {
    code: 'voice_empty_channel',
    stage: 'lifecycle',
    message: 'O canal de voz ficou sem ouvintes humanos.',
    recoverable: false,
    terminal: false,
    provider: inferProvider(queue?.currentTrack),
    pipeline: 'voice',
  };
}

export function mapCommandErrorKindToFailureCode(kind?: string): PlaybackFailureCode | null {
  switch (kind) {
    case 'validation':
      return 'command_validation';
    case 'authorization':
      return 'command_authorization';
    case 'precondition':
      return 'command_precondition';
    case 'conflict':
      return 'command_conflict';
    case 'dependency':
      return 'command_dependency';
    case 'infrastructure':
      return 'command_infrastructure';
    default:
      return null;
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'erro desconhecido';
}

function inferProvider(track?: Partial<Track> | null): PlaybackProvider {
  const url = track?.url?.toLowerCase() ?? '';
  const source = String(track?.raw?.source ?? track?.raw?.engine ?? track?.extractor?.identifier ?? '').toLowerCase();

  if (url.includes('spotify.com') || source.includes('spotify')) {
    return 'spotify';
  }

  if (url.includes('soundcloud.com') || source.includes('soundcloud')) {
    return 'soundcloud';
  }

  if (url.includes('youtu') || source.includes('youtube')) {
    return 'youtube';
  }

  return 'unknown';
}

function inferPipeline(error: unknown, track?: Partial<Track> | null): PlaybackPipeline {
  const message = getErrorMessage(error).toLowerCase();
  const source = String(track?.raw?.source ?? track?.raw?.engine ?? track?.extractor?.identifier ?? '').toLowerCase();

  if (message.includes('youtube-dl') || message.includes('youtube-dl-exec')) {
    return 'youtube-dl';
  }

  if (message.includes('youtubei') || source.includes('youtubei')) {
    return 'youtubei';
  }

  if (message.includes('spotify') || source.includes('spotify')) {
    return 'spotify-bridge';
  }

  if (message.includes('soundcloudextractor') || message.includes('soundcloud') || source.includes('soundcloud')) {
    return 'soundcloud-extractor';
  }

  if (mentionsFfmpeg(error)) {
    return 'ffmpeg';
  }

  if (message.includes('voice')) {
    return 'voice';
  }

  return 'unknown';
}

function isVoiceConnectionAbortError(error: unknown) {
  return (
    error instanceof Error &&
    ((error.name === 'AbortError' && (error as { code?: string }).code === 'ABORT_ERR') ||
      /operation was aborted/iu.test(error.message) ||
      /voice connection status ready/iu.test(error.message))
  );
}

function isTrackNoResultError(error: unknown) {
  return error instanceof Error && (error as { code?: string }).code === 'ERR_NO_RESULT';
}

function isTrackUnavailableError(error: unknown) {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === 'ERR_NO_RESULT' ||
      /could not extract stream for this track/iu.test(error.message) ||
      /no results found for/iu.test(error.message) ||
      /failed to extract signature/iu.test(error.message))
  );
}

function mentionsExtractor(error: unknown) {
  return error instanceof Error && /(youtubei|extractor|youtubejs)/iu.test(error.message);
}

function mentionsFfmpeg(error: unknown) {
  return error instanceof Error && /ffmpeg|avconv/iu.test(error.message);
}
