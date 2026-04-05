import type { FfmpegStatus } from '../music/ffmpeg.js';
import { DependencyCommandError } from './errors.js';

export function ensureAudioPlaybackAvailable(ffmpeg: FfmpegStatus) {
  if (ffmpeg.available) {
    return;
  }

  throw new DependencyCommandError(
    `O PHONIX precisa do FFmpeg para tocar audio. Configure ${ffmpeg.executable} ou defina FFMPEG_PATH. Detalhe: ${ffmpeg.detail}`,
    {
      title: 'FFmpeg nao encontrado',
    },
  );
}
