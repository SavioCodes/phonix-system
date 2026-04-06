import { PermissionFlagsBits, type Client, type Guild, type GuildMember } from 'discord.js';
import type { Player } from 'discord-player';
import { AuthorizationCommandError, ValidationCommandError } from '../../commands/errors.js';
import type { DoctorService } from '../services/doctorService.js';
import type { GuildSettingsService } from '../../library/services/guildSettingsService.js';
import type { PlaybackSessionManager } from '../../music/playbackSessionManager.js';
import type { QueueMetadata } from '../../music/musicService.js';
import { MusicService } from '../../music/musicService.js';
import type { AdminNoticeResult, DoctorResultView, GuildConfigResult, HelpResultView } from './contracts.js';
import type { HelpPageId, HelpPageView, NoticeFieldView } from '../../ui/view-models.js';
import { getCommandGuide } from '../../ui/command-guides.js';
import { hasAdministrativeControl, isOwnerUserId } from '../../../core/security/ownerAccess.js';

interface AdminUseCaseDeps {
  doctor: DoctorService;
  guildSettings: GuildSettingsService;
  playbackSessionManager: PlaybackSessionManager;
  music: MusicService;
  player: Player;
}

interface AdminScopedInput {
  guildId: string;
  member: GuildMember;
  userId: string;
}

interface ConfigViewInput {
  guildId: string;
  userId?: string;
  liveVolume: number | null;
}

interface PrefixInput extends AdminScopedInput {
  value: string;
}

interface VolumeInput extends AdminScopedInput {
  value: number;
  liveVolume: number | null;
  setLiveVolume?: (value: number) => void;
}

interface ToggleInput extends AdminScopedInput {
  enabled: boolean;
}

interface DoctorInput {
  client: Client;
  guild: Guild;
  member: GuildMember;
  userId: string;
  textChannelId: string;
}

interface HelpInput {
  guildId: string;
  member: GuildMember;
  userId: string;
  currentPage?: HelpPageId;
}

export function createAdminUseCases(deps: AdminUseCaseDeps) {
  return {
    async help(input: HelpInput): Promise<HelpResultView> {
      const [settings, sessionDiagnostics] = await Promise.all([
        deps.guildSettings.getSettings(input.guildId),
        deps.playbackSessionManager.getDiagnostics(input.guildId),
      ]);
      const queue = deps.player.nodes.get<QueueMetadata>(input.guildId);
      const hasActiveQueue = Boolean(queue && (queue.currentTrack || queue.size > 0));
      const memberIsAdmin = input.member.permissions.has(PermissionFlagsBits.Administrator);
      const memberIsOwner = isOwnerUserId(input.userId);
      const currentPage = input.currentPage ?? 'home';

      return {
        prefix: settings.prefix,
        currentPage,
        navigation: {
          guildId: input.guildId,
          userId: input.userId,
          currentPage,
          prefix: settings.prefix,
        },
        resumeQueueEnabled: settings.resumeQueueEnabled,
        hasActiveQueue,
        memberIsAdmin,
        memberIsOwner,
        pages: buildHelpPages({
          prefix: settings.prefix,
          hasActiveQueue,
          memberIsAdmin,
          memberIsOwner,
          resumeQueueEnabled: settings.resumeQueueEnabled,
          sessionDiagnostics,
        }),
        sessionDiagnostics,
      };
    },

    async doctor(input: DoctorInput): Promise<DoctorResultView> {
      ensureAdministrativeControl(input.member, input.userId, 'doctor');
      return deps.doctor.run({
        client: input.client,
        guild: input.guild,
        member: input.member,
        textChannelId: input.textChannelId,
      }).then((report) => ({
        ...report,
        navigation: {
          guildId: input.guild.id,
          userId: input.userId,
        },
      }));
    },

    async configView(input: ConfigViewInput): Promise<GuildConfigResult> {
      const [settings, sessionDiagnostics] = await Promise.all([
        deps.guildSettings.getSettings(input.guildId),
        deps.playbackSessionManager.getDiagnostics(input.guildId),
      ]);

      return {
        ...(input.userId
          ? {
              navigation: {
                guildId: input.guildId,
                userId: input.userId,
              },
            }
          : {}),
        settings: {
          prefix: settings.prefix,
          defaultVolume: settings.defaultVolume,
          autoplayEnabled: settings.autoplayEnabled,
          resumeQueueEnabled: settings.resumeQueueEnabled,
        },
        sessionDiagnostics,
        liveVolume: input.liveVolume,
      };
    },

    async setPrefix(input: PrefixInput): Promise<AdminNoticeResult> {
      ensureAdministrativeControl(input.member, input.userId, 'config');
      let settings;
      try {
        settings = await deps.guildSettings.setPrefix(input.guildId, input.value);
      } catch (error) {
        if (error instanceof Error) {
          throw new ValidationCommandError(error.message, {
            title: 'Prefixo invalido',
          });
        }

        throw error;
      }

      return notice('PHONIX | Prefixo atualizado', `O novo prefixo deste servidor agora e **${settings.prefix}**.`, {
        fields: [
          {
            name: 'Novo atalho do servidor',
            value: `Prefixo atual: **${settings.prefix}**`,
            inline: true,
          },
          {
            name: 'Impacto imediato',
            value: 'Os comandos com prefixo mudam agora. Slash commands continuam com o mesmo nome e o mesmo fluxo.',
            inline: true,
          },
        ],
        hint: `Use ${inline(`${settings.prefix}help`)} ou ${inline(`${settings.prefix}play lo-fi`)} para validar o novo atalho no prefixo.`,
      });
    },

    async setDefaultVolume(input: VolumeInput): Promise<AdminNoticeResult> {
      ensureAdministrativeControl(input.member, input.userId, 'config');
      let settings;
      try {
        settings = await deps.guildSettings.setDefaultVolume(input.guildId, input.value);
      } catch (error) {
        if (error instanceof Error) {
          throw new ValidationCommandError(error.message, {
            title: 'Volume padrao invalido',
          });
        }

        throw error;
      }

      if (input.setLiveVolume) {
        input.setLiveVolume(settings.defaultVolume);
      }

      return notice(
        'PHONIX | Volume padrao atualizado',
        `O volume padrao foi salvo em **${settings.defaultVolume}%**${input.liveVolume !== null ? ' e tambem foi aplicado na fila atual.' : '.'}`,
        {
          fields: [
            {
              name: 'Novo default',
              value: `Volume salvo: **${settings.defaultVolume}%**`,
              inline: true,
            },
            {
              name: 'Sessao atual',
              value:
                input.liveVolume !== null
                  ? `A fila ativa tambem foi sincronizada para **${settings.defaultVolume}%**.`
                  : 'Nenhuma fila ativa foi alterada agora.',
              inline: true,
            },
          ],
          hint: input.liveVolume !== null ? 'Use `/nowplaying` para revisar a sessao atual ou `/config view` para conferir todos os defaults.' : 'Use `/config view` para conferir o conjunto completo de defaults da guild.',
        },
      );
    },

    async setAutoplay(input: ToggleInput): Promise<AdminNoticeResult> {
      ensureAdministrativeControl(input.member, input.userId, 'config');
      await deps.music.setAutoplay(input.guildId, input.enabled);
      const liveQueue = deps.player.nodes.get<QueueMetadata>(input.guildId);
      return notice(
        'PHONIX | Autoplay padrao atualizado',
        `O autoplay padrao foi ${input.enabled ? 'ativado' : 'desativado'} neste servidor.`,
        {
          fields: [
            {
              name: 'Default salvo',
              value: `Autoplay padrao: **${input.enabled ? 'ativado' : 'desativado'}**`,
              inline: true,
            },
            {
              name: 'Sessao atual',
              value: liveQueue
                ? 'A fila ativa tambem recebeu esse ajuste imediatamente.'
                : 'Nenhuma fila ativa precisou ser sincronizada agora.',
              inline: true,
            },
          ],
          hint: 'Esse ajuste vira default para novas sessoes. Use `/doctor` se quiser revisar o pipeline de playback e as rotas atuais.',
        },
      );
    },

    async setResumeQueue(input: ToggleInput): Promise<AdminNoticeResult> {
      ensureAdministrativeControl(input.member, input.userId, 'config');
      const settings = await deps.guildSettings.setResumeQueue(input.guildId, input.enabled);
      const liveQueue = deps.player.nodes.get<QueueMetadata>(input.guildId);
      await deps.playbackSessionManager.handleResumeQueueSettingChange(input.guildId, input.enabled);

      if (input.enabled) {
        await deps.playbackSessionManager.syncActiveQueue(input.guildId);
      }

      return notice(
        'PHONIX | Resume queue atualizado',
        `A persistencia de fila foi ${settings.resumeQueueEnabled ? 'ativada' : 'desativada'} neste servidor.`,
        {
          fields: [
            {
              name: 'Persistencia da guild',
              value: `Resume queue: **${settings.resumeQueueEnabled ? 'ativado' : 'desativado'}**`,
              inline: true,
            },
            {
              name: 'Estado da fila agora',
              value: liveQueue
                ? settings.resumeQueueEnabled
                  ? 'A fila ativa foi sincronizada para o snapshot persistido da guild.'
                  : 'A fila ativa segue tocando, mas o PHONIX deixa de gravar novos snapshots desta guild.'
                : settings.resumeQueueEnabled
                  ? 'Nao havia fila ativa; o recurso fica pronto para as proximas sessoes.'
                  : 'Nao havia fila ativa nem snapshot novo para sincronizar.',
              inline: true,
            },
          ],
          hint: settings.resumeQueueEnabled
            ? 'Use `/recover` para testar a restauracao manual e `/config view` para acompanhar o estado persistido.'
            : 'Com resume queue desligado, o PHONIX nao tenta restaurar a fila depois de restart.',
        },
      );
    },
  };
}

function ensureAdministrativeControl(member: GuildMember, userId: string, commandName: string) {
  if (
    !hasAdministrativeControl({
      userId,
      member,
    })
  ) {
    throw new AuthorizationCommandError(
      `Apenas administradores do servidor ou o owner global do PHONIX podem usar o comando ${commandName}.`,
      {
        title: 'Permissao administrativa necessaria',
      },
    );
  }
}

function notice(
  title: string,
  description: string,
  options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
): AdminNoticeResult {
  return {
    kind: 'notice',
    variant: 'success',
    title,
    description,
    fields: options.fields,
    hint: options.hint ?? null,
  };
}

function buildHelpPages(input: {
  prefix: string;
  hasActiveQueue: boolean;
  memberIsAdmin: boolean;
  memberIsOwner: boolean;
  resumeQueueEnabled: boolean;
  sessionDiagnostics: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>;
}): Record<HelpPageId, HelpPageView> {
  const prefix = input.prefix;
  const recoveryState = formatRecoveryState(input.sessionDiagnostics.state);
  const recoveryHealth = formatRecoveryHealth(input.sessionDiagnostics.health);
  const recoveryBlock =
    input.sessionDiagnostics.lastAutoRecoverBlockReason ??
    'Quando houver sessao pendente, use /recover ou !retomar para restaurar a fila no seu canal atual.';
  const playGuide = getCommandGuide('play');
  const favoriteGuide = getCommandGuide('favorite');
  const playlistGuide = getCommandGuide('playlist');
  const historyGuide = getCommandGuide('history');
  const configGuide = getCommandGuide('config');
  const doctorGuide = getCommandGuide('doctor');
  const ownerGuide = getCommandGuide('owner');
  const guildStateNow = buildGuildStateNow(input, recoveryState, recoveryHealth);
  const playbackActionNow = buildPlaybackActionNow(input, prefix);
  const libraryActionNow = buildLibraryActionNow(input, prefix);
  const recoveryActionNow = buildRecoveryActionNow(input, prefix);
  const adminActionNow = buildAdminActionNow(input, prefix, recoveryState, recoveryHealth);

  return {
    home: {
      id: 'home',
      label: 'Inicio',
      title: 'PHONIX | Comece por aqui',
      description: input.hasActiveQueue
        ? 'Uma central pratica para entender o que faz sentido fazer agora na sessao ativa desta guild.'
        : input.sessionDiagnostics.recoveryReady
          ? 'Uma central pratica para retomar a guild com seguranca: existe sessao salva pronta para recover.'
          : 'Uma central pratica para comecar a usar o PHONIX sem decorar tudo de uma vez.',
      fields: [
        {
          name: 'Como comecar em 3 passos',
          value: [
            '1. Entre em um canal de voz.',
            `2. Use ${inline('/play lo-fi')} ou ${inline(`${prefix}play lo-fi`)}.`,
            `3. Controle com ${inline('/pause')}, ${inline('/skip')} e ${inline('/queue')}.`,
          ].join('\n'),
        },
        {
          name: 'Comandos mais usados',
          value: [
            `${inline(playGuide.slashExamples[0] ?? '/play lo-fi hip hop')} ou ${inline(playGuide.prefixExamples?.[0] ?? `${prefix}tocar lo-fi hip hop`)}`,
            `${inline(playGuide.slashExamples[1] ?? '/play neon skyline mode:next')} ou ${inline(playGuide.prefixExamples?.[1] ?? `${prefix}tocar --next neon skyline`)}`,
            `${inline('/queue')} ou ${inline(`${prefix}fila`)}`,
            `${inline('/nowplaying')} ou ${inline(`${prefix}agora`)}`,
            `${inline('/recover')} ou ${inline(`${prefix}retomar`)}`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Atalhos PT-BR',
          value: [
            inline(`${prefix}tocar`),
            inline(`${prefix}tocar --proxima`),
            inline(`${prefix}fila`),
            inline(`${prefix}pular`),
            inline(`${prefix}retomar`),
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Se algo falhar',
          value: [
            'Entre em um canal de voz antes de usar comandos de playback.',
            'Se o bot ja estiver em outro canal, entre nele ou use `/stop` para encerrar a sessao atual antes de puxar outra.',
            'Use `/doctor` se o servidor estiver com erro recorrente e `/help` para navegar pelas outras paginas guiadas.',
          ].join('\n'),
        },
        {
          name: 'Estado desta guild agora',
          value: guildStateNow,
        },
        {
          name: 'Atalho certo agora',
          value: playbackActionNow,
        },
      ],
    },
    playback: {
      id: 'playback',
      label: 'Playback',
      title: 'PHONIX | Playback',
      description: input.hasActiveQueue
        ? 'Tudo o que voce usa para controlar e organizar a sessao que ja esta ativa nesta guild.'
        : 'Tudo o que voce usa para iniciar, controlar e organizar a fila quando a guild estiver pronta para tocar.',
      fields: [
        {
          name: 'Tocar e controlar',
          value: [
            `${inline(playGuide.slashExamples[0] ?? '/play lo-fi hip hop')} ou ${inline(playGuide.prefixExamples?.[0] ?? `${prefix}play lo-fi hip hop`)}`,
            `${inline(playGuide.slashExamples[1] ?? '/play neon skyline mode:next')} ou ${inline(playGuide.prefixExamples?.[1] ?? `${prefix}play --next neon skyline`)}`,
            `${inline('/play orbital mode:replace')} ou ${inline(`${prefix}play --replace orbital`)}`,
            `${inline('/pause')} / ${inline('/resume')}`,
            `${inline('/skip')} / ${inline('/stop')}`,
            'Use `/play` ou `/recover` para conectar o PHONIX automaticamente quando precisar iniciar uma sessao.',
          ].join('\n'),
        },
        {
          name: 'Fila',
          value: [
            inline('/queue'),
            inline('/nowplaying'),
            inline('/shuffle'),
            inline('/remove'),
            inline('/clear'),
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Ajustes e retomada',
          value: [inline('/volume 80'), inline('/loop queue'), inline('/recover')].join('\n'),
          inline: true,
        },
        {
          name: 'Origem da busca',
          value: [inline('/play query source:youtube'), inline('/play query source:spotify'), inline(`${prefix}play --youtube`)].join('\n'),
          inline: true,
        },
        {
          name: 'Clareza de source',
          value: [
            'Spotify hoje funciona por bridge: o PHONIX aceita links e metadados do Spotify, mas o audio sai por uma origem compativel, nao do source original.',
            'NAO IMPLEMENTADO AINDA: `source:soundcloud` como alternativa futura de source direto.',
          ].join('\n'),
        },
        {
          name: 'Feedback inteligente',
          value: [
            'O PHONIX diferencia busca sem resultado, URL nao suportada, permissao ausente e falha de stream.',
            'Playlists grandes entram com limite seguro e o bot avisa quando truncar a busca para preservar estabilidade.',
          ].join('\n'),
        },
        {
          name: 'O que faz sentido agora',
          value: playbackActionNow,
        },
      ],
    },
    library: {
      id: 'library',
      label: 'Biblioteca',
      title: 'PHONIX | Biblioteca',
      description: input.hasActiveQueue
        ? 'Salve o que voce curte sem perder a sessao atual e reaproveite depois com indices rapidos.'
        : 'Salve o que voce curte e reuse depois sem procurar tudo de novo, mesmo quando a guild ainda nao tiver fila ativa.',
      fields: [
        {
          name: 'Favoritos',
          value: [
            `${inline(favoriteGuide.slashExamples[0] ?? '/favorite add')} salva a faixa atual.`,
            `${inline(favoriteGuide.slashExamples[1] ?? '/favorite add query:night drive')} salva por busca ou URL.`,
            `${inline(favoriteGuide.slashExamples[2] ?? '/favorite play index:1')} toca um favorito salvo.`,
          ].join('\n'),
        },
        {
          name: 'Playlists',
          value: [
            inline(playlistGuide.slashExamples[0] ?? '/playlist create name:"mix phonk"'),
            inline(playlistGuide.slashExamples[1] ?? '/playlist add name:"mix phonk"'),
            inline(playlistGuide.slashExamples[2] ?? '/playlist play name:"mix phonk"'),
          ].join('\n'),
        },
        {
          name: 'Historico',
          value: `${inline(historyGuide.slashExamples[0] ?? '/history')} mostra suas ultimas faixas reproduzidas.`,
        },
        {
          name: 'Dica de uso',
          value: [
            'Sem `query`, favorite e playlist tentam usar a faixa atual da fila.',
            'No prefixo, nomes de playlist com espacos precisam ficar entre aspas para o parser manter a frase inteira.',
          ].join('\n'),
        },
        {
          name: 'Fluxo rapido desta guild',
          value: libraryActionNow,
        },
      ],
    },
    recovery: {
      id: 'recovery',
      label: 'Recovery',
      title: 'PHONIX | Recovery',
      description: 'O PHONIX pode restaurar a fila apos restart quando a persistencia estiver ativa.',
      fields: [
        {
          name: 'Como funciona',
          value: [
            `Resume queue: **${input.resumeQueueEnabled ? 'ativado' : 'desativado'}**`,
            `Estado salvo: **${recoveryState}**`,
            `Saude da sessao: **${recoveryHealth}**`,
            `Fila ativa agora: **${input.hasActiveQueue ? 'sim' : 'nao'}**`,
            `Pronta para recover: **${input.sessionDiagnostics.recoveryReady ? 'sim' : 'nao'}**`,
          ].join('\n'),
        },
        {
          name: 'Quando usar',
          value: [
            `${inline('/recover')} restaura a sessao pendente no seu canal atual.`,
            `${inline(`${prefix}retomar`)} faz o mesmo pelo prefixo.`,
            'Se o bot reiniciar e ainda houver pessoas no canal salvo, ele tenta auto-recuperar.',
          ].join('\n'),
        },
        {
          name: 'Ultimo sinal relevante',
          value: [recoveryBlock, input.sessionDiagnostics.healthDetail].join('\n'),
        },
        {
          name: 'Estado desta guild agora',
          value: [
            `Sessao ativa: **${input.hasActiveQueue ? 'sim' : 'nao'}**`,
            `Resume queue: **${input.resumeQueueEnabled ? 'sim' : 'nao'}**`,
            `Recovery pronto: **${input.sessionDiagnostics.recoveryReady ? 'sim' : 'nao'}**`,
            `Intervencao manual: **${input.sessionDiagnostics.manualInterventionRequired ? 'sim' : 'nao'}**`,
          ].join('\n'),
        },
        {
          name: 'O que fazer agora',
          value: recoveryActionNow,
        },
      ],
    },
    admin: {
      id: 'admin',
      label: 'Admin',
      title: 'PHONIX | Admin',
      description: input.memberIsAdmin
        ? 'Configuracoes e diagnostico do servidor. Esses comandos exigem permissao administrativa.'
        : 'Voce pode ver esta pagina, mas os comandos abaixo exigem permissao administrativa no servidor.',
      fields: [
        {
          name: 'Configuracao',
          value: [
            inline(configGuide.slashExamples[0] ?? '/config view'),
            inline(configGuide.slashExamples[1] ?? '/config prefix value:?'),
            inline('/config volume value:80'),
            inline('/config autoplay enabled:true'),
            inline('/config resumequeue enabled:true'),
          ].join('\n'),
        },
        {
          name: 'Diagnostico',
          value: [
            inline(doctorGuide.slashExamples[0] ?? '/doctor'),
            inline(doctorGuide.prefixExamples?.[0] ?? `${prefix}doctor`),
            'Use o doctor para checar FFmpeg, recovery, telemetria e estado do player.',
          ].join('\n'),
        },
        {
          name: 'Aviso de permissao',
          value: input.memberIsOwner
            ? 'Voce e o owner global do PHONIX. O bot libera bypass operacional controlado no prefixo administrativo e uma area `/owner` exclusiva.'
            : input.memberIsAdmin
              ? 'Voce tem permissao para usar os comandos administrativos deste servidor.'
              : 'Peca para um administrador usar config e doctor se precisar ajustar o servidor.',
        },
        {
          name: 'Leitura desta guild',
          value: [
            `Fila ativa: **${input.hasActiveQueue ? 'sim' : 'nao'}**`,
            `Resume queue: **${input.resumeQueueEnabled ? 'sim' : 'nao'}**`,
            `Estado da sessao: **${recoveryState}**`,
            `Saude da sessao: **${recoveryHealth}**`,
          ].join('\n'),
        },
        {
          name: 'Como agir agora',
          value: adminActionNow,
        },
        ...(input.memberIsOwner
          ? [
              {
                name: 'Owner global',
                value: [
                  inline(ownerGuide.slashExamples[0] ?? '/owner status'),
                  inline(ownerGuide.slashExamples[1] ?? '/owner official-guild'),
                  inline(ownerGuide.slashExamples[2] ?? '/owner incidents'),
                  inline(ownerGuide.slashExamples[3] ?? '/owner notify-test'),
                ].join('\n'),
              },
            ]
          : []),
      ],
    },
  };
}

function buildGuildStateNow(
  input: {
    hasActiveQueue: boolean;
    resumeQueueEnabled: boolean;
    sessionDiagnostics: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>;
  },
  recoveryState: string,
  recoveryHealth: string,
) {
  return [
    `Fila ativa: **${input.hasActiveQueue ? 'sim' : 'nao'}**`,
    `Resume queue: **${input.resumeQueueEnabled ? 'sim' : 'nao'}**`,
    `Estado salvo: **${recoveryState}**`,
    `Saude da sessao: **${recoveryHealth}**`,
    `Pronta para recover: **${input.sessionDiagnostics.recoveryReady ? 'sim' : 'nao'}**`,
  ].join('\n');
}

function buildPlaybackActionNow(
  input: {
    hasActiveQueue: boolean;
    sessionDiagnostics: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>;
  },
  prefix: string,
) {
  if (input.hasActiveQueue) {
    return [
      `A sessao ja esta ativa: revise com ${inline('/queue')} ou ${inline(`${prefix}fila`)}.`,
      `Use ${inline('/nowplaying')} para focar na musica atual, ${inline('/skip')} para avancar ou ${inline('/volume 80')} para ajustar a sessao.`,
    ].join('\n');
  }

  if (input.sessionDiagnostics.recoveryReady) {
    return [
      `Existe sessao salva pronta para restore: use ${inline('/recover')} ou ${inline(`${prefix}retomar`)} antes de montar uma fila nova.`,
      `Depois, confirme o resultado com ${inline('/queue')} ou ${inline('/nowplaying')}.`,
    ].join('\n');
  }

  return [
    `Nao ha fila ativa nem sessao pronta para recover: comece com ${inline('/play lo-fi hip hop')} ou ${inline(`${prefix}play lo-fi hip hop`)}.`,
    `Se quiser controlar a entrada na fila, use ${inline('/play neon skyline mode:next')} ou ${inline(`${prefix}play --replace night drive`)}.`,
  ].join('\n');
}

function buildLibraryActionNow(
  input: {
    hasActiveQueue: boolean;
  },
  prefix: string,
) {
  if (input.hasActiveQueue) {
    return [
      'Como a guild ja tem sessao ativa, `favorite add` e `playlist add` podem reaproveitar a faixa atual sem `query`.',
      `Use ${inline('/favorite list')} para revisar indices, ${inline('/playlist list')} para revisar nomes e ${inline(`${prefix}history`)} para consultar o historico recente.`,
    ].join('\n');
  }

  return [
    'Sem fila ativa, favorite e playlist precisam de uma busca ou URL quando voce quiser salvar algo agora.',
    `Comece com ${inline('/play')} para montar contexto de sessao, ou salve direto com ${inline('/favorite add query:night drive')} e ${inline('/playlist add name:"mix" query:night drive')}.`,
  ].join('\n');
}

function buildRecoveryActionNow(
  input: {
    hasActiveQueue: boolean;
    resumeQueueEnabled: boolean;
    sessionDiagnostics: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>;
  },
  prefix: string,
) {
  if (!input.resumeQueueEnabled) {
    return `O Smart Session desta guild esta desligado. Ative ${inline('/config resumequeue enabled:true')} ou ${inline(`${prefix}config resumequeue on`)} para voltar a persistir a fila.`;
  }

  if (input.hasActiveQueue) {
    return `Ja existe fila ativa nesta guild. Revise a sessao com ${inline('/queue')} ou encerre com ${inline('/stop')} antes de tentar um novo recover manual.`;
  }

  if (input.sessionDiagnostics.recoveryReady) {
    return `A guild esta pronta para restore. Use ${inline('/recover')} ou ${inline(`${prefix}retomar`)} e depois valide o resultado com ${inline('/doctor')}.`;
  }

  if (input.sessionDiagnostics.manualInterventionRequired) {
    return `O PHONIX detectou um estado que pede leitura manual. Rode ${inline('/doctor')} antes de insistir em um novo recover.`;
  }

  return 'No momento nao existe sessao aproveitavel para restore nesta guild. Monte uma fila nova com `/play` para gerar um snapshot saudavel.';
}

function buildAdminActionNow(
  input: {
    hasActiveQueue: boolean;
    memberIsAdmin: boolean;
    memberIsOwner: boolean;
    resumeQueueEnabled: boolean;
    sessionDiagnostics: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>;
  },
  prefix: string,
  recoveryState: string,
  recoveryHealth: string,
) {
  if (input.memberIsOwner) {
    return [
      `Voce pode combinar ${inline('/doctor')} com ${inline('/owner status')} para ler a guild e o estado global do bot.`,
      `Leitura atual: sessao **${recoveryState}**, saude **${recoveryHealth}**, resume queue **${input.resumeQueueEnabled ? 'ativo' : 'inativo'}**.`,
    ].join('\n');
  }

  if (!input.memberIsAdmin) {
    return 'Voce nao tem permissao administrativa nesta guild. Peca para um admin usar `config` e `doctor` se precisar ajustar o servidor.';
  }

  if (input.sessionDiagnostics.manualInterventionRequired) {
    return `Ha sinal de sessao sensivel nesta guild. Comece com ${inline('/doctor')} para entender o bloqueio e ajuste ${inline('/config resumequeue')} so depois da leitura.`;
  }

  if (input.sessionDiagnostics.recoveryReady && !input.hasActiveQueue) {
    return `Existe sessao salva pronta para recover. Valide com ${inline('/doctor')} e depois decida entre ${inline('/recover')} ou uma fila nova.`;
  }

  return `Use ${inline('/config view')} para revisar defaults e ${inline('/doctor')} para auditar playback, session health, dashboard e observabilidade da guild.`;
}

function formatRecoveryState(state: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>['state']) {
  if (state === 'recovering') {
    return 'recuperando';
  }

  if (state === 'active') {
    return 'ativa';
  }

  if (state === 'pending') {
    return 'pendente';
  }

  return 'nenhuma';
}

function formatRecoveryHealth(health: Awaited<ReturnType<PlaybackSessionManager['getDiagnostics']>>['health']) {
  if (health === 'healthy') {
    return 'saudavel';
  }

  if (health === 'recoverable') {
    return 'recuperavel';
  }

  if (health === 'partial') {
    return 'parcial';
  }

  if (health === 'broken') {
    return 'quebrada';
  }

  return 'desativada';
}

function inline(value: string) {
  return `\`${value}\``;
}
