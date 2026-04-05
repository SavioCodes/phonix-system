import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { AuthorizationCommandError, ValidationCommandError } from './errors.js';
import { type CommandDefinition, parseInteger } from './framework.js';
import { presentCommandView, presentGuildConfigResult } from './presenters.js';
import { buildCommandUsageDescription } from '../ui/command-guides.js';

type ConfigArgs =
  | { subcommand: 'view' }
  | { subcommand: 'prefix'; value: string }
  | { subcommand: 'volume'; value: number }
  | { subcommand: 'autoplay'; enabled: boolean }
  | { subcommand: 'resumequeue'; enabled: boolean };

const configCommand: CommandDefinition<ConfigArgs> = {
  name: 'config',
  description: 'Painel administrativo da guild para defaults operacionais, Smart Session e recovery previsivel',
  aliases: [],
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Mostra e ajusta prefixo, volume padrao, autoplay e Smart Session deste servidor com leitura guiada')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand.setName('view').setDescription('Resume defaults, sessao persistida, recovery e atalhos administrativos da guild'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('prefix')
        .setDescription('Atualiza o prefixo usado pelos comandos com ! neste servidor e explica o impacto imediato')
        .addStringOption((option) =>
          option.setName('value').setDescription('Novo prefixo, com ate 5 caracteres e sem espacos').setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('volume')
        .setDescription('Atualiza o volume padrao das novas sessoes e sincroniza a fila ativa quando existir')
        .addIntegerOption((option) =>
          option.setName('value').setDescription('Novo volume padrao entre 0 e 150').setMinValue(0).setMaxValue(150).setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('autoplay')
        .setDescription('Ativa ou desativa o autoplay padrao do servidor e explica o impacto nas novas sessoes')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Ativar autoplay').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('resumequeue')
        .setDescription('Ativa ou desativa persistencia, Smart Session e recovery de fila da guild')
        .addBooleanOption((option) => option.setName('enabled').setDescription('Ativar persistencia e recover da fila').setRequired(true)),
    ),
  parsePrefix(tokens) {
    const rawSubcommand = tokens[0]?.toLowerCase() ?? 'view';
    const subcommand = normalizeSubcommand(rawSubcommand);

    switch (subcommand) {
      case 'view':
        return { subcommand };
      case 'prefix':
        return { subcommand, value: tokens[1] ?? '' };
      case 'volume':
        return { subcommand, value: parseInteger(tokens[1], 'volume') };
      case 'autoplay':
        return { subcommand, enabled: parseToggleValue(tokens[1], 'autoplay') };
      case 'resumequeue':
        return { subcommand, enabled: parseToggleValue(tokens[1], 'resume queue') };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('config'), {
          title: 'Subcomando de config invalido',
        });
    }
  },
  parseSlash(interaction) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'view':
        return { subcommand };
      case 'prefix':
        return { subcommand, value: interaction.options.getString('value', true) };
      case 'volume':
        return { subcommand, value: interaction.options.getInteger('value', true) };
      case 'autoplay':
        return { subcommand, enabled: interaction.options.getBoolean('enabled', true) };
      case 'resumequeue':
        return { subcommand, enabled: interaction.options.getBoolean('enabled', true) };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('config'), {
          title: 'Subcomando de config invalido',
        });
    }
  },
  async execute(context, args) {
    if (!context.hasAdministrativeControl()) {
      throw new AuthorizationCommandError('Apenas administradores do servidor ou o owner global do PHONIX podem usar os comandos de configuracao do PHONIX.', {
        title: 'Permissao administrativa necessaria',
      });
    }

    switch (args.subcommand) {
      case 'view': {
        return presentGuildConfigResult(
          await context.services.useCases.admin.configView({
            guildId: context.guild.id,
            liveVolume: context.queue?.node.volume ?? null,
          }),
        );
      }

      case 'prefix': {
        return presentCommandView(
          await context.services.useCases.admin.setPrefix({
            guildId: context.guild.id,
            member: context.member,
            userId: context.user.id,
            value: args.value,
          }),
        );
      }

      case 'volume': {
        return presentCommandView(
          await context.services.useCases.admin.setDefaultVolume({
            guildId: context.guild.id,
            member: context.member,
            userId: context.user.id,
            value: args.value,
            liveVolume: context.queue?.node.volume ?? null,
            setLiveVolume: context.queue ? (value) => context.queue?.node.setVolume(value) : undefined,
          }),
        );
      }

      case 'autoplay': {
        return presentCommandView(
          await context.services.useCases.admin.setAutoplay({
            guildId: context.guild.id,
            member: context.member,
            userId: context.user.id,
            enabled: args.enabled,
          }),
        );
      }

      case 'resumequeue': {
        return presentCommandView(
          await context.services.useCases.admin.setResumeQueue({
            guildId: context.guild.id,
            member: context.member,
            userId: context.user.id,
            enabled: args.enabled,
          }),
        );
      }
    }
  },
};

export const configCommands = [configCommand] as const;

function normalizeSubcommand(subcommand: string) {
  if (['view', 'ver', 'show', 'mostrar'].includes(subcommand)) {
    return 'view' as const;
  }

  if (['prefix', 'prefixo'].includes(subcommand)) {
    return 'prefix' as const;
  }

  if (subcommand === 'volume') {
    return 'volume' as const;
  }

  if (['autoplay', 'auto'].includes(subcommand)) {
    return 'autoplay' as const;
  }

  if (['resumequeue', 'resumefila', 'recover', 'retomar'].includes(subcommand)) {
    return 'resumequeue' as const;
  }

  throw new ValidationCommandError(buildCommandUsageDescription('config'), {
    title: 'Subcomando de config invalido',
  });
}

function parseToggleValue(value: string | undefined, label: string) {
  const normalized = value?.toLowerCase();

  if (!normalized) {
    throw new ValidationCommandError(buildCommandUsageDescription('config', 'both', `Informe se deseja ativar ou desativar ${label}.`), {
      title: `Informe on ou off para ${label}`,
    });
  }

  if (['on', 'true', 'ativar', 'ativo', 'sim'].includes(normalized)) {
    return true;
  }

  if (['off', 'false', 'desativar', 'inativo', 'nao'].includes(normalized)) {
    return false;
  }

  throw new ValidationCommandError(buildCommandUsageDescription('config', 'both', `Use on/off para ajustar ${label}.`), {
    title: `Valor invalido para ${label}`,
  });
}
