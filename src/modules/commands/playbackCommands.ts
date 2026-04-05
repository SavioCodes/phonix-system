import { SlashCommandBuilder } from 'discord.js';
import { CommandContext, type CommandDefinition, type CommandResult, parseInteger } from './framework.js';
import { ValidationCommandError } from './errors.js';
import { presentCommandView } from './presenters.js';
import { buildCommandUsageDescription } from '../ui/command-guides.js';

type PlayMode = 'queue' | 'next' | 'replace';
type PlaySource = 'auto' | 'youtube' | 'spotify';

type PlayArgs = {
  query: string;
  mode: PlayMode;
  source: PlaySource;
};
type VolumeArgs = { value?: number };
type LoopArgs = { mode?: 'off' | 'track' | 'queue' };
type RemoveArgs = { index: number };

const playCommand: CommandDefinition<PlayArgs> = {
  name: 'play',
  description: 'Busca uma musica ou URL, conecta o PHONIX se preciso e explica claramente como a faixa entra na sessao',
  aliases: ['tocar', 'p'],
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Busca uma musica ou URL, conecta o PHONIX se preciso e mostra como a entrada afeta a sessao')
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName('query').setDescription('Busca, titulo ou URL do YouTube/Spotify para tocar agora').setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Como a busca deve entrar na sessao atual')
        .setRequired(false)
        .addChoices(
          { name: 'Adicionar ao fim da fila (padrao)', value: 'queue' },
          { name: 'Entrar logo depois da faixa atual', value: 'next' },
          { name: 'Substituir a fila atual', value: 'replace' },
        ),
    )
    .addStringOption((option) =>
      option
        .setName('source')
        .setDescription('Origem preferida para buscas em texto; Spotify continua em bridge compativel')
        .setRequired(false)
        .addChoices(
          { name: 'Auto (padrao)', value: 'auto' },
          { name: 'YouTube', value: 'youtube' },
          { name: 'Spotify (bridge)', value: 'spotify' },
        ),
    ),
  async prepare(context) {
    if (context.source === 'prefix') {
      await context.signalTyping();
      return;
    }
  },
  parsePrefix(tokens) {
    return parsePlayPrefixArgs(tokens);
  },
  parseSlash(interaction) {
    return {
      query: normalizePlayQueryInput(interaction.options.getString('query', true)),
      mode: (interaction.options.getString('mode') as PlayMode | null) ?? 'queue',
      source: (interaction.options.getString('source') as PlaySource | null) ?? 'auto',
    };
  },
  async execute(context, args) {
    return presentCommandView(
      await context.services.useCases.playback.play({
        guildId: context.guild.id,
        member: context.member,
        user: context.user,
        metadata: context.metadata,
        query: args.query,
        mode: args.mode,
        source: args.source,
        sourceContext: context.source,
      }),
    );
  },
};

const recoverCommand: CommandDefinition<Record<string, never>> = {
  name: 'recover',
  description: 'Tenta restaurar a ultima sessao salva da guild e mostra o que voltou, o que ficou parcial e o que pedir atencao',
  aliases: ['retomar'],
  data: new SlashCommandBuilder()
    .setName('recover')
    .setDescription('Restaura a ultima fila salva, reaplica a sessao e avisa com clareza quando algo ficou parcial')
    .setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(
      await context.services.useCases.playback.recover({
        guildId: context.guild.id,
        member: context.member,
        user: context.user,
        metadata: context.metadata,
      }),
    );
  },
};

function simplePlaybackCommand(
  name: string,
  description: string,
  aliases: string[],
  action: (context: CommandContext) => Promise<CommandResult>,
): CommandDefinition<Record<string, never>> {
  return {
    name,
    description,
    aliases,
    data: new SlashCommandBuilder().setName(name).setDescription(description).setDMPermission(false),
    parsePrefix() {
      return {};
    },
    parseSlash() {
      return {};
    },
    async execute(context) {
      return action(context);
    },
  };
}

const pauseCommand = simplePlaybackCommand('pause', 'Pausa a faixa atual e preserva a sessao para retomada rapida', ['pausar'], async (context) => {
  return presentCommandView(
    await context.services.useCases.playback.pause({
      guildId: context.guild.id,
      member: context.member,
    }),
  );
});

const resumeCommand = simplePlaybackCommand('resume', 'Retoma a faixa pausada e continua a sessao do ponto em que parou', ['continuar'], async (context) => {
  return presentCommandView(
    await context.services.useCases.playback.resume({
      guildId: context.guild.id,
      member: context.member,
    }),
  );
});

const skipCommand = simplePlaybackCommand('skip', 'Pula a faixa atual e chama a proxima entrada da fila, se existir', ['pular'], async (context) => {
  return presentCommandView(
    await context.services.useCases.playback.skip({
      guildId: context.guild.id,
      member: context.member,
    }),
  );
});

const stopCommand = simplePlaybackCommand('stop', 'Encerra a sessao atual, limpa a fila persistida e libera o canal de voz', ['parar', 'leave', 'sair', 'disconnect'], async (context) => {
  return presentCommandView(
    await context.services.useCases.playback.stop({
      guildId: context.guild.id,
      member: context.member,
      metadata: context.metadata,
    }),
  );
});

const queueCommand: CommandDefinition<Record<string, never>> = {
  name: 'queue',
  description: 'Abre o painel da sessao com faixa atual, fila, volume, loop, recovery e saude da guild',
  aliases: ['fila', 'q'],
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Mostra a fila atual com faixa em andamento, proximas musicas e leitura rapida de session health')
    .setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(
      await context.services.useCases.playback.queue({
        guildId: context.guild.id,
        member: context.member,
      }),
    );
  },
};

const nowPlayingCommand: CommandDefinition<Record<string, never>> = {
  name: 'nowplaying',
  description: 'Mostra a faixa atual com progresso, proxima entrada, rota de playback e estado real da sessao',
  aliases: ['agora', 'np'],
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Mostra a faixa atual com progresso, fila restante, recovery recente e leitura de session health')
    .setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(
      await context.services.useCases.playback.nowPlaying({
        guildId: context.guild.id,
        member: context.member,
      }),
    );
  },
};

const volumeCommand: CommandDefinition<VolumeArgs> = {
  name: 'volume',
  description: 'Mostra ou ajusta o volume da sessao atual sem perder a fila nem o contexto do canal',
  aliases: ['vol'],
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Mostra ou ajusta o volume da fila ativa sem encerrar a sessao do canal')
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option.setName('value').setDescription('Novo volume entre 0 e 150').setMinValue(0).setMaxValue(150).setRequired(false),
    ),
  parsePrefix(tokens) {
    return {
      value: tokens[0] ? parseInteger(tokens[0], 'volume') : undefined,
    };
  },
  parseSlash(interaction) {
    return {
      value: interaction.options.getInteger('value') ?? undefined,
    };
  },
  async execute(context, args) {
    return presentCommandView(
      await context.services.useCases.playback.volume({
        guildId: context.guild.id,
        member: context.member,
        value: args.value,
      }),
    );
  },
};

const loopCommand: CommandDefinition<LoopArgs> = {
  name: 'loop',
  description: 'Mostra ou ajusta como a sessao repete a faixa atual ou a fila inteira',
  aliases: ['repetir'],
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Controla como a sessao repete a faixa atual ou a fila inteira')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('mode')
        .setDescription('Como a fila atual deve se comportar quando uma faixa terminar')
        .setRequired(false)
        .addChoices(
          { name: 'Desligado (segue a fila normal)', value: 'off' },
          { name: 'Repetir somente a faixa atual', value: 'track' },
          { name: 'Repetir a fila inteira', value: 'queue' },
        ),
    ),
  parsePrefix(tokens) {
    const mode = normalizeLoopMode(tokens[0]);
    if (tokens[0] && !mode) {
      throw new ValidationCommandError('Use `loop off`, `loop track` ou `loop queue` no slash, ou `!loop desligado`, `!loop faixa` e `!loop fila` no prefixo para ajustar a repeticao.', {
        title: 'Modo de loop invalido',
      });
    }
    return { mode };
  },
  parseSlash(interaction) {
    return {
      mode: (interaction.options.getString('mode') as LoopArgs['mode'] | null) ?? undefined,
    };
  },
  async execute(context, args) {
    return presentCommandView(
      await context.services.useCases.playback.loop({
        guildId: context.guild.id,
        member: context.member,
        mode: args.mode,
      }),
    );
  },
};

const shuffleCommand: CommandDefinition<Record<string, never>> = {
  name: 'shuffle',
  description: 'Embaralha as proximas faixas sem interromper a musica atual',
  aliases: ['embaralhar'],
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Embaralha as proximas faixas da fila ativa').setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(
      await context.services.useCases.playback.shuffle({
        guildId: context.guild.id,
        member: context.member,
      }),
    );
  },
};

const removeCommand: CommandDefinition<RemoveArgs> = {
  name: 'remove',
  description: 'Remove uma faixa especifica da fila pelo numero exibido em queue, sem mexer na musica atual',
  aliases: ['remover'],
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove uma faixa especifica da fila pelo numero exibido em queue, sem interromper a sessao')
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option.setName('index').setDescription('Posicao exibida no painel de /queue').setMinValue(1).setRequired(true),
    ),
  parsePrefix(tokens) {
    return { index: parseInteger(tokens[0], 'index') };
  },
  parseSlash(interaction) {
    return { index: interaction.options.getInteger('index', true) };
  },
  async execute(context, args) {
    return presentCommandView(
      await context.services.useCases.playback.remove({
        guildId: context.guild.id,
        member: context.member,
        index: args.index,
      }),
    );
  },
};

const clearCommand: CommandDefinition<Record<string, never>> = {
  name: 'clear',
  description: 'Limpa as proximas faixas e preserva o que ja esta tocando agora',
  aliases: ['limpar'],
  data: new SlashCommandBuilder().setName('clear').setDescription('Limpa as proximas faixas da fila e preserva a musica atual').setDMPermission(false),
  parsePrefix() {
    return {};
  },
  parseSlash() {
    return {};
  },
  async execute(context) {
    return presentCommandView(
      await context.services.useCases.playback.clear({
        guildId: context.guild.id,
        member: context.member,
      }),
    );
  },
};

export const playbackCommands = [
  playCommand,
  pauseCommand,
  resumeCommand,
  skipCommand,
  stopCommand,
  queueCommand,
  nowPlayingCommand,
  volumeCommand,
  loopCommand,
  shuffleCommand,
  removeCommand,
  clearCommand,
  recoverCommand,
] as const;

function parsePlayPrefixArgs(tokens: string[]): PlayArgs {
  let mode: PlayMode = 'queue';
  let source: PlaySource = 'auto';
  let index = 0;

  while (index < tokens.length) {
    const rawToken = tokens[index];
    const token = rawToken?.toLowerCase();

    if (!token || !token.startsWith('--')) {
      break;
    }

    if (['--next', '--proxima'].includes(token)) {
      mode = setPlayMode(mode, 'next');
      index += 1;
      continue;
    }

    if (['--replace', '--substituir'].includes(token)) {
      mode = setPlayMode(mode, 'replace');
      index += 1;
      continue;
    }

    if (token === '--youtube') {
      source = setPlaySource(source, 'youtube');
      index += 1;
      continue;
    }

    if (token === '--spotify') {
      source = setPlaySource(source, 'spotify');
      index += 1;
      continue;
    }

    break;
  }

  const query = tokens.slice(index).join(' ').trim();
  return {
    query: normalizePlayQueryInput(query),
    mode,
    source,
  };
}

function setPlayMode(current: PlayMode, next: Exclude<PlayMode, 'queue'>): PlayMode {
  if (current !== 'queue' && current !== next) {
    throw new ValidationCommandError(
      buildCommandUsageDescription('play', 'prefix', 'Use apenas um modo de fila por vez: `--next` ou `--replace`.'),
      {
        title: 'Escolha um unico modo de fila',
      },
    );
  }

  return next;
}

function setPlaySource(current: PlaySource, next: Exclude<PlaySource, 'auto'>): PlaySource {
  if (current !== 'auto' && current !== next) {
    throw new ValidationCommandError(
      buildCommandUsageDescription('play', 'prefix', 'Use apenas uma origem por vez: `--youtube` ou `--spotify`.'),
      {
        title: 'Escolha uma unica origem',
      },
    );
  }

  return next;
}

function normalizePlayQueryInput(query: string) {
  const normalized = query.trim().replace(/^["'`]+|["'`]+$/gu, '').trim();
  if (!normalized) {
    throw new ValidationCommandError(
      'Informe o que voce quer tocar. Exemplos: `/play lo-fi hip hop`, `/play https://youtu.be/...` ou `!play --next night drive`.',
      {
        title: 'Informe uma musica ou URL',
      },
    );
  }

  return normalized;
}

function normalizeLoopMode(value?: string): LoopArgs['mode'] | undefined {
  const normalized = value?.toLowerCase();

  if (!normalized) {
    return undefined;
  }

  if (['off', 'desligado', 'desativado', 'normal'].includes(normalized)) {
    return 'off';
  }

  if (['track', 'faixa', 'musica'].includes(normalized)) {
    return 'track';
  }

  if (['queue', 'fila'].includes(normalized)) {
    return 'queue';
  }

  return undefined;
}
