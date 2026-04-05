import { describe, expect, it, vi } from 'vitest';
import { utilityCommands } from '../../src/modules/commands/utilityCommands.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';
import { createCommandContext } from '../support/commandContext.js';

const historyCommand = utilityCommands.find((command) => command.name === 'history');
const helpCommand = utilityCommands.find((command) => command.name === 'help');

describe('utility commands', () => {
  it('history delegates to the library use case and returns the structured notice payload', async () => {
    const history = vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'info',
      title: 'PHONIX | Historico recente',
      description: 'Estas sao as ultimas faixas registradas.',
      hint: 'Use /play para repetir uma busca.',
    });

    const payload = await historyCommand!.execute(
      createCommandContext({
        user: { id: 'user-1' },
        services: {
          useCases: {
            library: {
              history,
            },
          },
        },
      }),
      {} as never,
    );

    expect(history).toHaveBeenCalledWith('user-1');
    expect(payload?.embeds?.[0]?.data?.title).toBe('PHONIX | Historico recente');
  });

  it('help delegates to the admin help use case and preserves interactive navigation components', async () => {
    const help = vi.fn().mockResolvedValue({
      prefix: '!',
      currentPage: 'home',
      navigation: {
        guildId: 'guild-1',
        userId: 'user-1',
        currentPage: 'home',
        prefix: '!',
      },
      resumeQueueEnabled: true,
      hasActiveQueue: false,
      memberIsAdmin: false,
      memberIsOwner: false,
      pages: {
        home: { id: 'home', label: 'Inicio', title: 'PHONIX | Comece por aqui', description: 'inicio', fields: [] },
        playback: { id: 'playback', label: 'Playback', title: 'PHONIX | Playback', description: 'playback', fields: [] },
        library: { id: 'library', label: 'Biblioteca', title: 'PHONIX | Biblioteca', description: 'library', fields: [] },
        recovery: { id: 'recovery', label: 'Recovery', title: 'PHONIX | Recovery', description: 'recovery', fields: [] },
        admin: { id: 'admin', label: 'Admin', title: 'PHONIX | Admin', description: 'admin', fields: [] },
      },
      sessionDiagnostics: createSessionDiagnostics(),
    });

    const payload = await helpCommand!.execute(
      createCommandContext({
        guild: { id: 'guild-1' },
        member: { id: 'member-1' },
        user: { id: 'user-1' },
        services: {
          useCases: {
            admin: {
              help,
            },
          },
        },
      }),
      {} as never,
    );

    expect(help).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: { id: 'member-1' },
      userId: 'user-1',
      currentPage: 'home',
    });
    expect(payload?.embeds?.[0]?.data?.title).toBe('PHONIX | Comece por aqui');
    expect(payload?.components).toHaveLength(2);
  });
});
