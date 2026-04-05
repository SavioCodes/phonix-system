import { SlashCommandBuilder } from 'discord.js';
import { type CommandDefinition } from './framework.js';
import { presentCommandView, presentHelpResult } from './presenters.js';

const historyCommand: CommandDefinition<Record<string, never>> = {
  name: 'history',
  description: 'Mostra suas ultimas faixas reproduzidas no PHONIX com foco em memoria rapida e reutilizacao',
  aliases: ['historico'],
  data: new SlashCommandBuilder()
    .setName('history')
    .setDescription('Mostra suas ultimas faixas reproduzidas no PHONIX com dicas para salvar ou repetir depois')
    .setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(await context.services.useCases.library.history(context.user.id));
  },
};

const helpCommand: CommandDefinition<Record<string, never>> = {
  name: 'help',
  description: 'Abre a central guiada do PHONIX com leitura da guild, playback, recovery, biblioteca e admin',
  aliases: ['ajuda'],
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Abre a central guiada com onboarding, recovery, biblioteca, admin e leitura da guild')
    .setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentHelpResult(
      await context.services.useCases.admin.help({
        guildId: context.guild.id,
        member: context.member,
        userId: context.user.id,
        currentPage: 'home',
      }),
    );
  },
};

export const utilityCommands = [historyCommand, helpCommand] as const;
