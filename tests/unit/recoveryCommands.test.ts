import { describe, expect, it, vi } from 'vitest';
import { configCommands } from '../../src/modules/commands/configCommands.js';
import { playbackCommands } from '../../src/modules/commands/playbackCommands.js';

const recoverCommand = playbackCommands.find((command) => command.name === 'recover');
const configCommand = configCommands.find((command) => command.name === 'config');

describe('recovery-related commands', () => {
  it('recover surfaces a friendly error from the playback use case', async () => {
    const recover = vi
      .fn()
      .mockRejectedValue(new Error('Nao existe sessao pendente para recuperar neste servidor.'));

    await expect(
      recoverCommand!.execute(
        {
          guild: {
            id: 'guild-1',
          },
          member: {
            voice: {
              channel: {
                id: 'voice-1',
              },
            },
          },
          user: {
            id: 'user-1',
          },
          metadata: {
            textChannelId: 'text-1',
          },
          services: {
            useCases: {
              playback: {
                recover,
              },
            },
          },
        } as never,
        {} as never,
      ),
    ).rejects.toThrow('Nao existe sessao pendente para recuperar neste servidor.');

    expect(recover).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: {
        voice: {
          channel: {
            id: 'voice-1',
          },
        },
      },
      user: {
        id: 'user-1',
      },
      metadata: {
        textChannelId: 'text-1',
      },
    });
  });

  it('config resumequeue delegates to the admin use case and renders the result', async () => {
    const setResumeQueue = vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'success',
      title: 'PHONIX | Configuracao atualizada',
      description: 'A persistencia de fila foi ativada neste servidor.',
    });

    const payload = await configCommand!.execute(
      {
        guild: {
          id: 'guild-1',
        },
        member: {
          permissions: {
            has: () => true,
          },
        },
        user: {
          id: '976586934455513159',
        },
        hasAdministrativeControl: () => true,
        queue: {
          node: {
            volume: 70,
          },
        },
        services: {
          useCases: {
            admin: {
              setResumeQueue,
            },
          },
        },
      } as never,
      {
        subcommand: 'resumequeue',
        enabled: true,
      } as never,
    );

    expect(payload?.embeds?.[0]?.data?.description).toContain('persistencia de fila foi ativada');
    expect(setResumeQueue).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: {
        permissions: {
          has: expect.any(Function),
        },
      },
      userId: '976586934455513159',
      enabled: true,
    });
  });
});
