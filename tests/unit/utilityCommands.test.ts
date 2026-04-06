import { MessageFlags } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { utilityCommands } from '../../src/modules/commands/utilityCommands.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';
import { createCommandContext } from '../support/commandContext.js';
import { renderDiscordValue, renderEmbed } from '../support/discordPayload.js';

const historyCommand = utilityCommands.find((command) => command.name === 'history');
const helpCommand = utilityCommands.find((command) => command.name === 'help');

describe('utility commands', () => {
  it('history delegates to the library use case and returns the structured collection panel', async () => {
    const history = vi.fn().mockResolvedValue({
      kind: 'collection',
      title: 'PHONIX | Historico recente',
      description: 'Estas sao as ultimas faixas registradas.',
      panel: {
        surface: 'history',
        guildId: 'guild-1',
        userId: 'user-1',
        contextId: null,
        hasLeadAction: true,
      },
      collectionTitle: 'Ultimas reproducoes',
      leadTrack: null,
      entries: [
        {
          position: 1,
          title: 'Night Drive',
          subtitle: 'Nova',
          duration: '4:02',
          sourceLabel: 'YouTube',
          url: 'https://example.com/track-1',
        },
      ],
      hiddenEntryCount: 0,
      summaryTitle: 'Memoria recente',
      summaryLines: ['Faixas registradas: **1**'],
      actionTitle: 'Como reaproveitar',
      actionLines: ['Use /play para repetir uma busca.'],
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

    expect(history).toHaveBeenCalledWith({
      guildId: 'guild-1',
      user: { id: 'user-1' },
      member: {},
      metadata: { textChannelId: 'text-1' },
    });
    expect(payload?.flags).toBe(MessageFlags.IsComponentsV2);
    const rendered = renderDiscordValue<{ components?: Array<{ content?: string }> }>(payload?.components?.[0] as never);
    expect(rendered?.components?.some((component) => component.content?.includes('PHONIX | Historico recente'))).toBe(true);
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
    expect(renderEmbed(payload?.embeds?.[0])?.title).toBe('PHONIX | Comece por aqui');
    expect(payload?.components).toHaveLength(2);
  });
});
