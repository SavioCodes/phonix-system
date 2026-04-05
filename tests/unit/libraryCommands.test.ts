import { describe, expect, it, vi } from 'vitest';
import { libraryCommands } from '../../src/modules/commands/libraryCommands.js';

const favoriteCommand = libraryCommands.find((command) => command.name === 'favorite');
const playlistCommand = libraryCommands.find((command) => command.name === 'playlist');

describe('library commands', () => {
  it('keeps playlist explicit and removes the low-discoverability pl alias', () => {
    expect(playlistCommand?.aliases).toEqual([]);
  });

  it('favorite add forwards the friendly error from the library use case', async () => {
    const favoriteAdd = vi
      .fn()
      .mockRejectedValue(new Error('Nada tocando agora. Informe uma busca ou URL para salvar.'));

    await expect(
      favoriteCommand!.execute(
        {
          queue: null,
          member: {},
          user: { id: 'user-1' },
          metadata: { textChannelId: 'text-1' },
          guild: { id: 'guild-1' },
          services: {
            useCases: {
              library: {
                favoriteAdd,
              },
            },
          },
        } as never,
        { subcommand: 'add', query: undefined } as never,
      ),
    ).rejects.toThrow('Nada tocando agora. Informe uma busca ou URL para salvar.');

    expect(favoriteAdd).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
      queue: undefined,
      query: undefined,
    });
  });

  it('playlist create maps the normalized playlist name returned by the use case', async () => {
    const playlistCreate = vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'success',
      title: 'Playlist criada',
      description: 'A playlist **mix phonk** foi criada.',
    });

    const payload = await playlistCommand!.execute(
      {
        guild: {
          id: 'guild-1',
        },
        member: {},
        metadata: {
          textChannelId: 'text-1',
        },
        services: {
          useCases: {
            library: {
              playlistCreate,
            },
          },
        },
        user: {
          id: 'user-1',
        },
      } as never,
      { subcommand: 'create', name: '  mix phonk  ' } as never,
    );

    const embed = payload?.embeds?.[0];
    expect(embed?.data?.description).toContain('**mix phonk**');
    expect(embed?.data?.description).not.toContain('**  mix phonk  **');
    expect(playlistCreate).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
      name: '  mix phonk  ',
    });
  });

  it('signals typing for prefix playlist add before doing library search work', async () => {
    const signalTyping = vi.fn().mockResolvedValue(undefined);

    await playlistCommand!.prepare?.(
      {
        source: 'prefix',
        signalTyping,
      } as never,
      { subcommand: 'add', name: 'mix phonk', query: 'night drive' } as never,
    );

    expect(signalTyping).toHaveBeenCalledTimes(1);
  });
});
