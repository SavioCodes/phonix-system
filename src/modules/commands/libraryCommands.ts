import { SlashCommandBuilder } from 'discord.js';
import { ValidationCommandError } from './errors.js';
import { type CommandDefinition, parseInteger } from './framework.js';
import { presentCommandView } from './presenters.js';
import { buildCommandUsageDescription } from '../ui/command-guides.js';

type FavoriteArgs =
  | { subcommand: 'add'; query?: string }
  | { subcommand: 'remove'; index: number }
  | { subcommand: 'list' }
  | { subcommand: 'play'; index: number };

type PlaylistArgs =
  | { subcommand: 'create'; name: string }
  | { subcommand: 'add'; name: string; query?: string }
  | { subcommand: 'remove'; name: string; index: number }
  | { subcommand: 'list'; name?: string }
  | { subcommand: 'play'; name: string }
  | { subcommand: 'delete'; name: string };

const favoriteCommand: CommandDefinition<FavoriteArgs> = {
  name: 'favorite',
  description: 'Guarda, lista, remove e reutiliza atalhos pessoais de musica com indices rapidos',
  aliases: ['fav', 'favorito'],
  data: new SlashCommandBuilder()
    .setName('favorite')
    .setDescription('Guarda, lista, remove e reutiliza seus favoritos pessoais sem sair da sessao')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Salva a faixa atual ou uma busca/URL como atalho pessoal reutilizavel')
        .addStringOption((option) => option.setName('query').setDescription('Busca ou URL opcional').setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove um favorito salvo pelo indice exibido em favorite list')
        .addIntegerOption((option) => option.setName('index').setDescription('Indice do favorito').setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName('list').setDescription('Lista seus favoritos com indices, duracao e proximo passo'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Puxa um favorito salvo de volta para a sessao atual e reaproveita o canal')
        .addIntegerOption((option) => option.setName('index').setDescription('Indice do favorito').setMinValue(1).setRequired(true)),
    ),
  async prepare(context, args) {
    if (context.source === 'prefix' && ['add', 'play'].includes(args.subcommand)) {
      await context.signalTyping();
    }
  },
  parsePrefix(tokens) {
    const subcommand = tokens[0]?.toLowerCase();
    if (!subcommand) {
      throw new ValidationCommandError(buildCommandUsageDescription('favorite'), {
        title: 'Subcomando de favorite invalido',
      });
    }

    switch (subcommand) {
      case 'add':
        return { subcommand, query: tokens.slice(1).join(' ').trim() || undefined };
      case 'remove':
        return { subcommand, index: parseInteger(tokens[1], 'index') };
      case 'list':
        return { subcommand };
      case 'play':
        return { subcommand, index: parseInteger(tokens[1], 'index') };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('favorite'), {
          title: 'Subcomando de favorite invalido',
        });
    }
  },
  parseSlash(interaction) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'add':
        return { subcommand, query: interaction.options.getString('query') ?? undefined };
      case 'remove':
        return { subcommand, index: interaction.options.getInteger('index', true) };
      case 'list':
        return { subcommand };
      case 'play':
        return { subcommand, index: interaction.options.getInteger('index', true) };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('favorite'), {
          title: 'Subcomando de favorite invalido',
        });
    }
  },
  async execute(context, args) {
    switch (args.subcommand) {
      case 'add': {
        return presentCommandView(
          await context.services.useCases.library.favoriteAdd({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            queue: context.queue ?? undefined,
            query: args.query,
          }),
        );
      }

      case 'remove': {
        return presentCommandView(
          await context.services.useCases.library.favoriteRemove({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            index: args.index,
          }),
        );
      }

      case 'list': {
        return presentCommandView(
          await context.services.useCases.library.favoriteList({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
          }),
        );
      }

      case 'play': {
        return presentCommandView(
          await context.services.useCases.library.favoritePlay({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            index: args.index,
          }),
        );
      }
    }
  },
};

const playlistCommand: CommandDefinition<PlaylistArgs> = {
  name: 'playlist',
  description: 'Cria, organiza, lista e toca playlists pessoais reaproveitando a sessao atual sempre que possivel',
  aliases: [],
  data: new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('Cria, organiza, lista e toca playlists pessoais diretamente pelo Discord, sem sair da sessao')
    .setDMPermission(false)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('create')
        .setDescription('Cria uma nova playlist pessoal pronta para receber faixas')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('add')
        .setDescription('Adiciona a faixa atual ou uma busca/URL a uma playlist pessoal')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(true))
        .addStringOption((option) => option.setName('query').setDescription('Busca ou URL opcional').setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('remove')
        .setDescription('Remove uma faixa de uma playlist pelo indice exibido em playlist list')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(true))
        .addIntegerOption((option) => option.setName('index').setDescription('Indice da faixa').setMinValue(1).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Lista suas playlists ou mostra o conteudo completo de uma playlist especifica')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(false)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('play')
        .setDescription('Toca uma playlist salva e explica como ela entrou na sessao atual')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('delete')
        .setDescription('Apaga uma playlist inteira da sua biblioteca pessoal')
        .addStringOption((option) => option.setName('name').setDescription('Nome da playlist').setRequired(true)),
    ),
  async prepare(context, args) {
    if (context.source === 'prefix' && ['add', 'play'].includes(args.subcommand)) {
      await context.signalTyping();
    }
  },
  parsePrefix(tokens) {
    const subcommand = tokens[0]?.toLowerCase();
    if (!subcommand) {
      throw new ValidationCommandError(buildCommandUsageDescription('playlist'), {
        title: 'Subcomando de playlist invalido',
      });
    }

    switch (subcommand) {
      case 'create':
        return { subcommand, name: tokens[1] ?? '' };
      case 'add':
        return { subcommand, name: tokens[1] ?? '', query: tokens.slice(2).join(' ').trim() || undefined };
      case 'remove':
        return { subcommand, name: tokens[1] ?? '', index: parseInteger(tokens[2], 'index') };
      case 'list':
        return { subcommand, name: tokens[1] ?? undefined };
      case 'play':
        return { subcommand, name: tokens[1] ?? '' };
      case 'delete':
        return { subcommand, name: tokens[1] ?? '' };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('playlist'), {
          title: 'Subcomando de playlist invalido',
        });
    }
  },
  parseSlash(interaction) {
    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
      case 'create':
        return { subcommand, name: interaction.options.getString('name', true) };
      case 'add':
        return {
          subcommand,
          name: interaction.options.getString('name', true),
          query: interaction.options.getString('query') ?? undefined,
        };
      case 'remove':
        return {
          subcommand,
          name: interaction.options.getString('name', true),
          index: interaction.options.getInteger('index', true),
        };
      case 'list':
        return { subcommand, name: interaction.options.getString('name') ?? undefined };
      case 'play':
        return { subcommand, name: interaction.options.getString('name', true) };
      case 'delete':
        return { subcommand, name: interaction.options.getString('name', true) };
      default:
        throw new ValidationCommandError(buildCommandUsageDescription('playlist'), {
          title: 'Subcomando de playlist invalido',
        });
    }
  },
  async execute(context, args) {
    if ('name' in args && typeof args.name === 'string' && !args.name.trim()) {
      throw new ValidationCommandError(buildCommandUsageDescription('playlist', 'both', 'Informe um nome valido para a playlist.'), {
        title: 'Informe um nome de playlist',
      });
    }

    switch (args.subcommand) {
      case 'create': {
        return presentCommandView(
          await context.services.useCases.library.playlistCreate({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            name: args.name,
          }),
        );
      }

      case 'add': {
        return presentCommandView(
          await context.services.useCases.library.playlistAdd({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            queue: context.queue ?? undefined,
            name: args.name,
            query: args.query,
          }),
        );
      }

      case 'remove': {
        return presentCommandView(
          await context.services.useCases.library.playlistRemove({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            name: args.name,
            index: args.index,
          }),
        );
      }

      case 'list': {
        return presentCommandView(
          await context.services.useCases.library.playlistList({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            name: args.name,
          }),
        );
      }

      case 'play': {
        return presentCommandView(
          await context.services.useCases.library.playlistPlay({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            name: args.name,
          }),
        );
      }

      case 'delete': {
        return presentCommandView(
          await context.services.useCases.library.playlistDelete({
            guildId: context.guild.id,
            user: context.user,
            member: context.member,
            metadata: context.metadata,
            name: args.name,
          }),
        );
      }
    }
  },
};

export const libraryCommands = [favoriteCommand, playlistCommand] as const;
