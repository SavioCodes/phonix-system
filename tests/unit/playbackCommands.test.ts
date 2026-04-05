import { describe, expect, it, vi } from 'vitest';
import { playbackCommands } from '../../src/modules/commands/playbackCommands.js';

const playCommand = playbackCommands.find((command) => command.name === 'play');
const stopCommand = playbackCommands.find((command) => command.name === 'stop');
const skipCommand = playbackCommands.find((command) => command.name === 'skip');
const loopCommand = playbackCommands.find((command) => command.name === 'loop');

describe('play command', () => {
  it('keeps the simple prefix flow when no flags are used', () => {
    expect(playCommand?.parsePrefix(['lo-fi', 'hip', 'hop'])).toEqual({
      query: 'lo-fi hip hop',
      mode: 'queue',
      source: 'auto',
    });
  });

  it('parses next and source flags at the beginning of the prefix command', () => {
    expect(playCommand?.parsePrefix(['--next', '--youtube', 'night', 'drive'])).toEqual({
      query: 'night drive',
      mode: 'next',
      source: 'youtube',
    });
  });

  it('treats later flag-like tokens as part of the query', () => {
    expect(playCommand?.parsePrefix(['lofi', '--spotify'])).toEqual({
      query: 'lofi --spotify',
      mode: 'queue',
      source: 'auto',
    });
  });

  it('returns a friendly guidance message when the prefix query is empty', () => {
    expect(() => playCommand?.parsePrefix(['--next'])).toThrow(/Informe o que voce quer tocar/i);
  });

  it('signals typing for prefix play requests before execution', async () => {
    const signalTyping = vi.fn().mockResolvedValue(undefined);

    await playCommand?.prepare?.(
      {
        source: 'prefix',
        signalTyping,
        reply: vi.fn(),
      } as never,
      {
        query: 'night drive',
        mode: 'queue',
        source: 'auto',
      } as never,
    );

    expect(signalTyping).toHaveBeenCalledTimes(1);
  });

  it('delegates slash args including mode and source to the playback use case', async () => {
    const play = vi.fn().mockResolvedValue({
      kind: 'play',
      title: 'PHONIX | Fila substituida',
      description: 'A fila atual foi substituida e a nova faixa entrou imediatamente.',
      track: {
        title: 'Neon Skyline',
        author: 'Aria',
        duration: '3:50',
        thumbnail: 'https://example.com/thumb.png',
      },
      resultType: 'track',
      mode: 'replace',
      source: 'Spotify',
      startedPlayback: true,
      addedCount: 1,
      requestedCount: 1,
      truncatedCount: 0,
      queuePosition: null,
      estimatedWait: null,
      voiceChannelName: 'Synth Room',
      autoplayEnabled: false,
      hint: 'Use /queue para conferir a nova fila.',
    });

    const payload = await playCommand?.execute(
      {
        guild: { id: 'guild-1' },
        member: { id: 'member-1' },
        user: { id: 'user-1' },
        metadata: { textChannelId: 'text-1' },
        source: 'slash',
        services: {
          useCases: {
            playback: {
              play,
            },
          },
        },
      } as never,
      {
        query: 'neon skyline',
        mode: 'replace',
        source: 'spotify',
      } as never,
    );

    expect(play).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: { id: 'member-1' },
      user: { id: 'user-1' },
      metadata: { textChannelId: 'text-1' },
      query: 'neon skyline',
      mode: 'replace',
      source: 'spotify',
      sourceContext: 'slash',
    });
    expect(payload?.embeds?.[0]?.data?.title).toBe('PHONIX | Fila substituida');
  });

  it('makes Spotify bridge explicit in the slash command source option', () => {
    const data = playCommand?.data.toJSON();
    const sourceOption = data?.options?.find((option) => option.type === 3 && option.name === 'source');

    expect(sourceOption?.description).toContain('Spotify');
    expect(sourceOption?.description).toContain('bridge');
    expect(sourceOption && 'choices' in sourceOption ? sourceOption.choices?.some((choice) => choice.name === 'Spotify (bridge)' && choice.value === 'spotify') : false).toBe(true);
  });

  it('accepts friendlier Portuguese loop modes in prefix commands', () => {
    expect(loopCommand?.parsePrefix(['faixa'])).toEqual({ mode: 'track' });
    expect(loopCommand?.parsePrefix(['fila'])).toEqual({ mode: 'queue' });
    expect(loopCommand?.parsePrefix(['desligado'])).toEqual({ mode: 'off' });
  });

  it('keeps legacy disconnect aliases on stop during the transition', () => {
    expect(stopCommand?.aliases).toEqual(expect.arrayContaining(['parar', 'leave', 'sair', 'disconnect']));
  });

  it('removes the confusing next alias from skip because play already owns next as a queue mode', () => {
    expect(skipCommand?.aliases).toEqual(['pular']);
  });

  it('removes standalone session commands that no longer add product value', () => {
    expect(playbackCommands.some((command) => command.name === 'join')).toBe(false);
    expect(playbackCommands.some((command) => command.name === 'leave')).toBe(false);
    expect(playbackCommands.some((command) => command.name === 'autoplay')).toBe(false);
  });
});
