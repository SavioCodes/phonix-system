import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { configCommands } from '../../src/modules/commands/configCommands.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

const configCommand = configCommands[0];

describe('config command', () => {
  it('drops the cryptic cfg alias to keep the admin surface explicit', () => {
    expect(configCommand.aliases).toEqual([]);
  });

  it('requires administrator permission for prefix config view as well', async () => {
    await expect(
      configCommand.execute(
        {
          hasAdministrativeControl: () => false,
        } as never,
        { subcommand: 'view' } as never,
      ),
    ).rejects.toThrow('Apenas administradores do servidor ou o owner global do PHONIX podem usar os comandos de configuracao do PHONIX.');
  });

  it('lets the owner bypass the guild admin gate for config commands', async () => {
    const payload = await configCommand.execute(
      {
        hasAdministrativeControl: () => true,
        guild: { id: 'guild-1' },
        queue: null,
        services: {
          useCases: {
            admin: {
              configView: async () => ({
                settings: {
                  prefix: '!',
                  defaultVolume: 70,
                  autoplayEnabled: false,
                  resumeQueueEnabled: true,
                },
                sessionDiagnostics: createSessionDiagnostics(),
                liveVolume: null,
              }),
            },
          },
        },
      } as never,
      { subcommand: 'view' } as never,
    );

    expect(payload?.flags).toBe(MessageFlags.IsComponentsV2);
    const rendered = payload?.components?.[0];
    expect(rendered && 'toJSON' in rendered ? rendered.toJSON() : rendered).toMatchObject({
      components: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('PHONIX | Configuracoes do servidor'),
        }),
      ]),
    });
  });

  it('returns a guided error when the toggle value is invalid', () => {
    expect(() => configCommand.parsePrefix(['autoplay', 'maybe'])).toThrow(/Use on\/off para ajustar autoplay/i);
  });

  it('accepts the friendlier portuguese subcommand aliases for config view and resume queue', () => {
    expect(configCommand.parsePrefix(['ver'])).toEqual({ subcommand: 'view' });
    expect(configCommand.parsePrefix(['resumefila', 'on'])).toEqual({ subcommand: 'resumequeue', enabled: true });
  });
});
