import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type MessageActionRowComponentBuilder,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../../core/logging/logger.js';
import type { CommandReplyPayload, CommandServices } from './framework.js';
import { embeds } from '../ui/embeds.js';
import type { HelpPageId, HelpResultView } from '../ui/view-models.js';

const HELP_COMPONENT_PREFIX = 'help';

type HelpComponentAction = 'select' | 'home' | 'refresh';

interface ParsedHelpCustomId {
  action: HelpComponentAction;
  currentPage: HelpPageId;
  guildId: string;
  userId: string;
}

type HelpComponentInteraction = StringSelectMenuInteraction | ButtonInteraction;

export function buildHelpNavigationComponents(view: HelpResultView): CommandReplyPayload['components'] {
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(buildHelpCustomId('select', view.currentPage, view.navigation.guildId, view.navigation.userId))
    .setPlaceholder('Navegue pela central do PHONIX')
    .addOptions(
      ...helpPageOptions.map((page) => ({
        label: page.label,
        value: page.id,
        description: page.description,
        default: page.id === view.currentPage,
      })),
    );

  const buttonHome = new ButtonBuilder()
    .setCustomId(buildHelpCustomId('home', view.currentPage, view.navigation.guildId, view.navigation.userId))
    .setLabel('Inicio')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(view.currentPage === 'home');

  const buttonRefresh = new ButtonBuilder()
    .setCustomId(buildHelpCustomId('refresh', view.currentPage, view.navigation.guildId, view.navigation.userId))
    .setLabel('Atualizar')
    .setStyle(ButtonStyle.Secondary);

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu) as ActionRowBuilder<MessageActionRowComponentBuilder>,
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttonHome, buttonRefresh) as ActionRowBuilder<MessageActionRowComponentBuilder>,
  ];
}

export async function handleHelpComponentInteraction(
  interaction: HelpComponentInteraction,
  services: CommandServices,
) {
  const parsed = parseHelpCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guild || interaction.guildId !== parsed.guildId) {
    await replyEphemeral(interaction, 'Este painel de ajuda ficou invalido. Use `/help` novamente.');
    return true;
  }

  if (interaction.user.id !== parsed.userId) {
    await replyEphemeral(interaction, 'Este painel de ajuda pertence a outra pessoa. Use `/help` para abrir o seu.');
    return true;
  }

  const targetPage = resolveTargetPage(interaction, parsed);
  if (!targetPage) {
    await replyEphemeral(interaction, 'A navegacao desta ajuda ficou invalida. Use `/help` novamente.');
    return true;
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const result = await services.useCases.admin.help({
      guildId: interaction.guildId,
      member,
      userId: interaction.user.id,
      currentPage: targetPage,
    });

    await interaction.update({
      embeds: [embeds.help(result)],
      components: buildHelpNavigationComponents(result),
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        customId: interaction.customId,
      },
      'Help component interaction failed',
    );
    await replyEphemeral(interaction, 'Nao consegui atualizar esta ajuda agora. Use `/help` novamente.');
  }

  return true;
}

function buildHelpCustomId(action: HelpComponentAction, currentPage: HelpPageId, guildId: string, userId: string) {
  return [HELP_COMPONENT_PREFIX, action, currentPage, guildId, userId].join(':');
}

function parseHelpCustomId(customId: string): ParsedHelpCustomId | null {
  const [prefix, action, currentPage, guildId, userId] = customId.split(':');
  if (prefix !== HELP_COMPONENT_PREFIX || !guildId || !userId) {
    return null;
  }

  if (!isHelpAction(action) || !isHelpPageId(currentPage)) {
    return null;
  }

  return {
    action,
    currentPage,
    guildId,
    userId,
  };
}

function resolveTargetPage(
  interaction: HelpComponentInteraction,
  parsed: ParsedHelpCustomId,
): HelpPageId | null {
  if (parsed.action === 'home') {
    return 'home';
  }

  if (parsed.action === 'refresh') {
    return parsed.currentPage;
  }

  if (!interaction.isStringSelectMenu()) {
    return null;
  }

  const selected = interaction.values[0];
  return isHelpPageId(selected) ? selected : null;
}

async function replyEphemeral(interaction: HelpComponentInteraction, content: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}

function isHelpAction(value: string): value is HelpComponentAction {
  return value === 'select' || value === 'home' || value === 'refresh';
}

function isHelpPageId(value: string): value is HelpPageId {
  return helpPageOptions.some((page) => page.id === value);
}

const helpPageOptions: Array<{
  id: HelpPageId;
  label: string;
  description: string;
}> = [
  { id: 'home', label: 'Inicio', description: 'Primeiros passos e atalhos principais' },
  { id: 'playback', label: 'Playback', description: 'Tocar, controlar e ajustar a fila' },
  { id: 'library', label: 'Biblioteca', description: 'Favoritos, playlists e historico' },
  { id: 'recovery', label: 'Recovery', description: 'Sessao persistida e retomada de fila' },
  { id: 'admin', label: 'Admin', description: 'Config, doctor e operacao do servidor' },
];
