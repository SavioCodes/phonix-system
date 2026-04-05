import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { handleHelpComponentInteraction } from '../../src/modules/commands/helpComponents.js';
import { presentHelpResult } from '../../src/modules/commands/presenters.js';
import type { HelpPageId, HelpResultView } from '../../src/modules/ui/view-models.js';
import { renderDiscordValue, renderEmbed } from '../support/discordPayload.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('help presentation and components', () => {
  it('renders help with navigation components', () => {
    const payload = presentHelpResult(createHelpView('home'));

    expect(payload.embeds).toHaveLength(1);
    expect(payload.components).toHaveLength(2);
    expect(renderEmbed(payload.embeds?.[0])?.title).toBe('PHONIX | Comece por aqui');

    const componentRows =
      payload.components?.map((row) => renderDiscordValue<{ components?: unknown[] }>(row as never) ?? {}) ?? [];
    expect(componentRows[0]?.components).toHaveLength(1);
    expect(componentRows[1]?.components).toHaveLength(2);
  });

  it('updates the help page when the owner uses the select menu', async () => {
    const help = vi.fn().mockResolvedValue(createHelpView('playback'));
    const update = vi.fn().mockResolvedValue(undefined);

    const handled = await handleHelpComponentInteraction(
      {
        customId: 'help:select:home:guild-1:user-1',
        values: ['playback'],
        user: { id: 'user-1' },
        guildId: 'guild-1',
        guild: {
          members: {
            fetch: vi.fn().mockResolvedValue({
              permissions: {
                has: () => false,
              },
            }),
          },
        },
        inGuild: () => true,
        isStringSelectMenu: () => true,
        deferred: false,
        replied: false,
        update,
      } as never,
      {
        useCases: {
          admin: {
            help,
          },
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(help).toHaveBeenCalledWith({
      guildId: 'guild-1',
      member: expect.anything(),
      userId: 'user-1',
      currentPage: 'playback',
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('blocks other users from interacting with someone else help panel', async () => {
    const reply = vi.fn().mockResolvedValue(undefined);

    const handled = await handleHelpComponentInteraction(
      {
        customId: 'help:refresh:home:guild-1:user-1',
        user: { id: 'user-2' },
        guildId: 'guild-1',
        guild: {},
        inGuild: () => true,
        isStringSelectMenu: () => false,
        deferred: false,
        replied: false,
        reply,
      } as never,
      {
        useCases: {
          admin: {
            help: vi.fn(),
          },
        },
      } as never,
    );

    expect(handled).toBe(true);
    expect(reply).toHaveBeenCalledWith({
      content: 'Este painel de ajuda pertence a outra pessoa. Use `/help` para abrir o seu.',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('ignores unrelated custom ids', async () => {
    const handled = await handleHelpComponentInteraction(
      {
        customId: 'queue:refresh:guild-1:user-1',
      } as never,
      {} as never,
    );

    expect(handled).toBe(false);
  });
});

function createHelpView(currentPage: HelpPageId): HelpResultView {
  return {
    prefix: '!',
    currentPage,
    navigation: {
      guildId: 'guild-1',
      userId: 'user-1',
      currentPage,
      prefix: '!',
    },
    resumeQueueEnabled: true,
    hasActiveQueue: currentPage !== 'admin',
    memberIsAdmin: currentPage === 'admin',
    memberIsOwner: false,
    pages: {
      home: {
        id: 'home',
        label: 'Inicio',
        title: 'PHONIX | Comece por aqui',
        description: 'Descricao inicial.',
        fields: [{ name: 'Como comecar em 3 passos', value: '1. Entre em call.' }],
      },
      playback: {
        id: 'playback',
        label: 'Playback',
        title: 'PHONIX | Playback',
        description: 'Controle a fila.',
        fields: [{ name: 'Tocar e controlar', value: '`/play`' }],
      },
      library: {
        id: 'library',
        label: 'Biblioteca',
        title: 'PHONIX | Biblioteca',
        description: 'Gerencie favoritos.',
        fields: [{ name: 'Favoritos', value: '`/favorite add`' }],
      },
      recovery: {
        id: 'recovery',
        label: 'Recovery',
        title: 'PHONIX | Recovery',
        description: 'Retome a fila.',
        fields: [{ name: 'Como funciona', value: 'Resume queue ativado.' }],
      },
      admin: {
        id: 'admin',
        label: 'Admin',
        title: 'PHONIX | Admin',
        description: 'Comandos administrativos.',
        fields: [{ name: 'Configuracao', value: '`/config view`' }],
      },
    },
    sessionDiagnostics: createSessionDiagnostics({
      state: 'pending',
      health: 'recoverable',
      healthDetail: 'Sessao persistida pronta para recover com 2 faixa(s).',
      hasPersistedSession: true,
      itemCount: 2,
      recoveryReady: true,
      updatedAt: new Date('2026-04-02T00:00:00.000Z'),
      voiceChannelId: 'voice-1',
      textChannelId: 'text-1',
      lastSyncReason: 'recover',
      lastRecoveryTrigger: 'startup',
      lastRecoveryStatus: 'success',
      lastRecoveryAttemptAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryAttempts: 1,
      lastRecoveryDurationMs: 1000,
      lastSuccessfulRecoveryAt: new Date('2026-04-02T00:00:01.000Z'),
      lastRecoveryRecoveredTrackCount: 2,
    }),
  };
}
