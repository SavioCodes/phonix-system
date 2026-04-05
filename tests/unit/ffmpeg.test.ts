import { describe, expect, it, vi } from 'vitest';
import { configureDiscordPlayerFfmpeg, registerPreferredFfmpegSource } from '../../src/modules/music/ffmpeg.js';

describe('ffmpeg runtime configuration', () => {
  it('prepends the configured executable as the preferred discord-player source', () => {
    const runtime = {
      sources: [
        { name: 'ffmpeg', module: false },
        { name: '@ffmpeg-installer/ffmpeg', module: true },
      ],
      resolve: vi.fn(),
    };

    registerPreferredFfmpegSource(runtime, 'C:\\ffmpeg\\bin\\ffmpeg.exe');

    expect(runtime.sources[0]).toEqual({
      name: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      module: false,
    });
    expect(runtime.sources).toHaveLength(3);
  });

  it('moves an existing configured executable to the front without duplicating it', () => {
    const runtime = {
      sources: [
        { name: 'ffmpeg', module: false },
        { name: 'C:\\ffmpeg\\bin\\ffmpeg.exe', module: false },
        { name: '@ffmpeg-installer/ffmpeg', module: true },
      ],
      resolve: vi.fn(),
    };

    registerPreferredFfmpegSource(runtime, 'C:\\ffmpeg\\bin\\ffmpeg.exe');

    expect(runtime.sources[0]).toEqual({
      name: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      module: false,
    });
    expect(runtime.sources.filter((source) => source.name === 'C:\\ffmpeg\\bin\\ffmpeg.exe')).toHaveLength(1);
  });

  it('forces discord-player to re-resolve ffmpeg after registering the preferred source', () => {
    const runtime = {
      sources: [{ name: 'ffmpeg', module: false }],
      resolve: vi.fn().mockReturnValue({
        command: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
        version: '8.1',
      }),
    };

    const resolved = configureDiscordPlayerFfmpeg('C:\\ffmpeg\\bin\\ffmpeg.exe', runtime);

    expect(runtime.resolve).toHaveBeenCalledWith(true);
    expect(runtime.sources[0]).toEqual({
      name: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      module: false,
    });
    expect(resolved).toEqual({
      command: 'C:\\ffmpeg\\bin\\ffmpeg.exe',
      version: '8.1',
    });
  });
});
