import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { ValidationCommandError } from './errors.js';
import type { CommandDefinition } from './framework.js';
import { presentCommandView } from './presenters.js';
import { requireOwner } from './preconditions.js';
import { buildCommandUsageDescription } from '../ui/command-guides.js';

type OwnerArgs =
  | { subcommand: 'status' }
  | { subcommand: 'incidents' }
  | { subcommand: 'guilds' }
  | { subcommand: 'official-guild' }
  | { subcommand: 'notify-test' };

const ownerCommand: CommandDefinition<OwnerArgs> = {
  name: 'owner',
  description: 'Abre a area global e restrita do owner do PHONIX',
  aliases: ['dono'],
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Status global, guild oficial, incidentes e notificacoes privadas do owner do PHONIX')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Mostra um resumo global do runtime do bot'))
    .addSubcommand((subcommand) => subcommand.setName('incidents').setDescription('Mostra os incidentes persistidos mais recentes do bot'))
    .addSubcommand((subcommand) => subcommand.setName('guilds').setDescription('Lista as guilds atualmente conectadas nesta execucao'))
    .addSubcommand((subcommand) =>
      subcommand.setName('official-guild').setDescription('Mostra o estado da guild oficial de referencia do PHONIX'),
    )
    .addSubcommand((subcommand) => subcommand.setName('notify-test').setDescription('Envia uma DM de teste ao owner com o resumo operacional atual')),
  parsePrefix(tokens) {
    const subcommand = normalizeOwnerSubcommand(tokens[0]?.toLowerCase() ?? 'status');
    return { subcommand };
  },
  parseSlash(interaction) {
    return {
      subcommand: normalizeOwnerSubcommand(interaction.options.getSubcommand()),
    };
  },
  async execute(context, args) {
    requireOwner(context, 'owner');

    switch (args.subcommand) {
      case 'status':
        return presentCommandView(
          await context.services.useCases.owner.status({
            client: context.client,
            requesterId: context.user.id,
          }),
        );
      case 'incidents':
        return presentCommandView(
          await context.services.useCases.owner.incidents({
            client: context.client,
            requesterId: context.user.id,
          }),
        );
      case 'guilds':
        return presentCommandView(
          await context.services.useCases.owner.guilds({
            client: context.client,
            requesterId: context.user.id,
          }),
        );
      case 'official-guild':
        return presentCommandView(
          await context.services.useCases.owner.officialGuild({
            client: context.client,
            requesterId: context.user.id,
          }),
        );
      case 'notify-test':
        return presentCommandView(
          await context.services.useCases.owner.notifyTest({
            client: context.client,
            requesterId: context.user.id,
          }),
        );
    }
  },
};

export const ownerCommands = [ownerCommand] as const;

function normalizeOwnerSubcommand(value: string) {
  if (['status', 'health', 'saude'].includes(value)) {
    return 'status' as const;
  }

  if (['incidents', 'incidentes', 'falhas'].includes(value)) {
    return 'incidents' as const;
  }

  if (['guilds', 'servers', 'servidores'].includes(value)) {
    return 'guilds' as const;
  }

  if (['official-guild', 'official', 'guild-oficial'].includes(value)) {
    return 'official-guild' as const;
  }

  if (['notify-test', 'notify', 'dm-test'].includes(value)) {
    return 'notify-test' as const;
  }

  throw new ValidationCommandError(buildCommandUsageDescription('owner'), {
    title: 'Subcomando de owner invalido',
  });
}
