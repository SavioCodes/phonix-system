import { spawnSync } from 'node:child_process';
import { FFmpeg } from 'discord-player';

export interface FfmpegStatus {
  available: boolean;
  executable: string;
  detail: string;
}

interface FfmpegRuntimeSource {
  name: string;
  module: boolean;
}

interface FfmpegRuntime {
  sources: FfmpegRuntimeSource[];
  resolve(force?: boolean): unknown;
}

export function checkFfmpeg(executable: string): FfmpegStatus {
  const result = spawnSync(executable, ['-version'], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (result.status === 0) {
    const firstLine = result.stdout.split(/\r?\n/u).find(Boolean) ?? 'ffmpeg detected';
    return {
      available: true,
      executable,
      detail: firstLine,
    };
  }

  return {
    available: false,
    executable,
    detail:
      (result.stderr || result.stdout || 'FFmpeg could not be executed.').trim() ||
      'FFmpeg could not be executed.',
  };
}

export function configureDiscordPlayerFfmpeg(executable: string, runtime: FfmpegRuntime = FFmpeg) {
  registerPreferredFfmpegSource(runtime, executable);
  return runtime.resolve(true);
}

export function registerPreferredFfmpegSource(runtime: FfmpegRuntime, executable: string) {
  const normalized = executable.trim();
  const existingIndex = runtime.sources.findIndex((source) => source.name === normalized && source.module === false);

  if (existingIndex >= 0) {
    const [existing] = runtime.sources.splice(existingIndex, 1);
    runtime.sources.unshift(existing);
    return;
  }

  runtime.sources.unshift({
    name: normalized,
    module: false,
  });
}
