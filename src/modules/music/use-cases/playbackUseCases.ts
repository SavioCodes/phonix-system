import { QueueRepeatMode, type GuildQueue, type Player } from 'discord-player';
import type { GuildMember, User } from 'discord.js';
import { PreconditionCommandError, ValidationCommandError } from '../../commands/errors.js';
import { ensureAudioPlaybackAvailable } from '../../commands/audioPlayback.js';
import type { OperationalTelemetryService } from '../../diagnostics/services/operationalTelemetryService.js';
import type {
  PlaybackRecoveryResult,
  PlaybackSessionDiagnostics,
  PlaybackSessionManager,
} from '../playbackSessionManager.js';
import type { FfmpegStatus } from '../ffmpeg.js';
import { inferTrackPlaybackRoute, MusicService, type QueueMetadata } from '../musicService.js';
import type { PlaybackActionResult } from './contracts.js';
import type {
  NoticeFieldView,
  NowPlayingView,
  PlayResultView,
  QueueEntryView,
  QueueView,
  RecoverView,
  SessionStatusView,
  TrackCardView,
} from '../../ui/view-models.js';
import { formatSourceLabel, toTrackCardView } from '../../ui/trackCards.js';

type LoopMode = 'off' | 'track' | 'queue';

interface PlaybackUseCaseDeps {
  player: Player;
  ffmpeg: FfmpegStatus;
  music: MusicService;
  playbackSessionManager: PlaybackSessionManager;
  operationalTelemetry: OperationalTelemetryService;
}

interface PlaybackBaseInput {
  guildId: string;
  member: GuildMember;
}

interface PlaybackActionInput extends PlaybackBaseInput {
  metadata: QueueMetadata;
}

interface PlayInput extends PlaybackActionInput {
  user: User;
  query: string;
  mode: 'queue' | 'next' | 'replace';
  source: 'auto' | 'youtube' | 'spotify';
  sourceContext: 'slash' | 'prefix';
}

interface RecoverInput extends PlaybackActionInput {
  user: User;
}

interface VolumeInput extends PlaybackBaseInput {
  value?: number;
}

interface LoopInput extends PlaybackBaseInput {
  mode?: LoopMode;
}

interface RemoveInput extends PlaybackBaseInput {
  index: number;
}

export function createPlaybackUseCases(deps: PlaybackUseCaseDeps) {
  return {
    async play(input: PlayInput): Promise<PlaybackActionResult> {
      ensureAudioPlaybackAvailable(deps.ffmpeg);
      const voiceChannel = await deps.music.ensurePlayableVoiceChannel(input.member);
      const result = await deps.music.play(voiceChannel, input.query, input.user, input.metadata, {
        mode: input.mode,
        forcedSource: input.source,
      });
      deps.operationalTelemetry.recordPlaybackSignal({
        guildId: input.guildId,
        type: 'play_request',
        channelId: result.queue.channel?.id ?? input.member.voice.channelId ?? voiceChannel.id,
        textChannelId: input.metadata.textChannelId,
        detail: `${input.sourceContext} | ${result.mode} | ${result.source} | ${result.provider}/${result.pipeline} | ${result.routeKind} | ${result.addedCount} faixa(s)`,
        provider: result.provider,
        pipeline: result.pipeline,
      });

      return toPlayResultView(result);
    },

    async recover(input: RecoverInput): Promise<PlaybackActionResult> {
      ensureAudioPlaybackAvailable(deps.ffmpeg);
      await deps.music.ensurePlayableVoiceChannel(input.member);
      let result;
      try {
        result = await deps.playbackSessionManager.recoverForMember(input.member, input.metadata, input.user);
      } catch (error) {
        throw mapRecoverError(error);
      }

      return toRecoverView(result);
    },

    async pause(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      if (!queue.node.pause()) {
        throw new ValidationCommandError('Nao foi possivel pausar a faixa atual.');
      }

      return notice('success', 'PHONIX | Reproducao pausada', 'A faixa atual foi pausada, mas a fila segue intacta para voce retomar do mesmo ponto.', {
        fields: [
          {
            name: 'Sessao atual',
            value: [
              `Canal: **${queue.channel?.name ?? 'nao identificado'}**`,
              `Faixas aguardando: **${queue.size}**`,
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Como seguir',
            value: 'Use `/resume` para continuar de onde parou ou `/stop` se quiser encerrar a sessao inteira.',
            inline: true,
          },
        ],
        hint: 'Use `/resume` ou `!resume` para continuar exatamente de onde parou.',
      });
    },

    async resume(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      if (!queue.node.resume()) {
        throw new ValidationCommandError('Nao foi possivel retomar a reproducao.');
      }

      return notice('success', 'PHONIX | Reproducao retomada', 'A sessao voltou a tocar no canal atual sem perder a ordem da fila.', {
        fields: [
          {
            name: 'Sessao atual',
            value: [
              `Canal: **${queue.channel?.name ?? 'nao identificado'}**`,
              `Faixas aguardando: **${queue.size}**`,
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Leitura rapida',
            value: 'O playback voltou no mesmo contexto do canal, sem recriar a fila e sem mexer na ordem salva.',
            inline: true,
          },
        ],
        hint: 'Use `/nowplaying` para revisar a faixa atual ou `/queue` para ver o restante da sessao.',
      });
    },

    async skip(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const nextTrack = queue.tracks.at(0);
      const queuedCountBeforeSkip = queue.size;
      if (!queue.node.skip()) {
        throw new ValidationCommandError('Nao foi possivel pular a faixa atual.');
      }

      return notice('success', 'PHONIX | Faixa pulada', 'A fila avancou para a proxima faixa disponivel da sessao.', {
        fields: [
          {
            name: 'Proxima entrada',
            value: nextTrack ? `A fila ja tinha **${nextTrack.title}** pronta para entrar em seguida.` : 'Nao havia proxima faixa preparada quando o skip foi solicitado.',
            inline: true,
          },
          {
            name: 'Fila antes do skip',
            value: `Itens aguardando: **${queuedCountBeforeSkip}**`,
            inline: true,
          },
        ],
        hint: nextTrack
          ? 'Use `/nowplaying` para conferir o que entrou no ar ou `/queue` para revisar o restante da fila.'
          : 'A sessao nao tinha outra faixa preparada. Use `/play` para continuar ou `/stop` se quiser encerrar o canal.',
      });
    },

    async stop(input: PlaybackActionInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const queueSize = queue.size;
      const channelName = queue.channel?.name ?? 'canal nao identificado';
      const hadCurrentTrack = Boolean(queue.currentTrack);
      await deps.playbackSessionManager.clearSessionForCommand(input.guildId, 'manualStop');
      queue.delete();
      deps.operationalTelemetry.recordPlaybackSignal({
        guildId: input.guildId,
        type: 'leave',
        channelId: queue.channel?.id ?? null,
        textChannelId: input.metadata.textChannelId,
        detail: 'stop',
      });

      return notice('success', 'PHONIX | Fila encerrada', 'A fila foi limpa, a sessao atual foi encerrada e o canal de voz ficou liberado para uma nova rodada.', {
        fields: [
          {
            name: 'Sessao encerrada',
            value: [
              `Canal: **${channelName}**`,
              `Faixa atual existia: **${formatEnabled(hadCurrentTrack)}**`,
              `Itens aguardando: **${queueSize}**`,
            ].join('\n'),
            inline: true,
          },
          {
            name: 'Persistencia',
            value: 'O snapshot salvo desta sessao foi limpo para evitar recover acidental de uma fila encerrada manualmente.',
            inline: true,
          },
        ],
        hint: 'Use `/play` para iniciar outra sessao ou `/recover` se quiser restaurar a ultima fila persistida.',
      });
    },

    async queue(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const diagnostics = await deps.playbackSessionManager.getDiagnostics(input.guildId);
      return toQueueView(queue, diagnostics, deps.music);
    },

    async nowPlaying(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const diagnostics = await deps.playbackSessionManager.getDiagnostics(input.guildId);
      return toNowPlayingView(queue, diagnostics, deps.music);
    },

    async volume(input: VolumeInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);

      if (input.value === undefined) {
        return notice('info', 'PHONIX | Volume atual', `O volume da sessao esta em **${queue.node.volume}%** neste momento.`, {
          fields: [
            {
              name: 'Sessao atual',
              value: [
                `Canal: **${queue.channel?.name ?? 'nao identificado'}**`,
                `Faixas aguardando: **${queue.size}**`,
              ].join('\n'),
              inline: true,
            },
            {
              name: 'Faixa segura',
              value: 'O PHONIX aceita valores entre **0** e **150** para o volume ao vivo.',
              inline: true,
            },
          ],
          hint: 'Use `/volume 80` ou `!volume 80` para ajustar o nivel sem encerrar a fila.',
        });
      }

      if (input.value < 0 || input.value > 150) {
        throw new ValidationCommandError('O volume precisa ficar entre 0 e 150.');
      }

      const previousVolume = queue.node.volume;
      queue.node.setVolume(input.value);
      return notice('success', 'PHONIX | Volume atualizado', `O novo volume da sessao ficou em **${input.value}%** e ja esta valendo para a fila ativa.`, {
        fields: [
          {
            name: 'Antes e depois',
            value: [`Anterior: **${previousVolume}%**`, `Atual: **${input.value}%**`].join('\n'),
            inline: true,
          },
          {
            name: 'Escopo',
            value: 'O ajuste vale para a fila ativa agora. Use `config volume` se quiser mudar o default das proximas sessoes da guild.',
            inline: true,
          },
        ],
        hint: 'Se precisar revisar o estado atual, use `/nowplaying` ou `/queue`.',
      });
    },

    async loop(input: LoopInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);

      if (!input.mode) {
        return notice('info', 'PHONIX | Loop atual', `O modo de repeticao da sessao esta em **${resolveLoopModeLabel(queue.repeatMode)}**.`, {
          fields: [
            {
              name: 'Como cada modo funciona',
              value: [
                '`off` ou `desligado`: segue a fila normal.',
                '`track` ou `faixa`: repete so a musica atual.',
                '`queue` ou `fila`: repete a fila inteira.',
              ].join('\n'),
              inline: false,
            },
          ],
          hint: 'Use `/loop track`, `/loop queue` ou `/loop off` para trocar o comportamento da fila.',
        });
      }

      const repeatMode =
        input.mode === 'track'
          ? QueueRepeatMode.TRACK
          : input.mode === 'queue'
            ? QueueRepeatMode.QUEUE
            : QueueRepeatMode.OFF;

      queue.setRepeatMode(repeatMode);

      return notice('success', 'PHONIX | Loop atualizado', `O modo de repeticao agora esta em **${resolveLoopModeLabel(repeatMode)}** para a sessao ativa.`, {
        fields: [
          {
            name: 'Modo aplicado',
            value: `Repeticao atual: **${resolveLoopModeLabel(repeatMode)}**`,
            inline: true,
          },
          {
            name: 'Como isso afeta a sessao',
            value:
              repeatMode === QueueRepeatMode.TRACK
                ? 'A musica atual se repete ate voce trocar o modo ou pular a faixa.'
                : repeatMode === QueueRepeatMode.QUEUE
                  ? 'Quando a fila terminar, o PHONIX volta ao inicio dela.'
                  : 'A fila segue normalmente sem repetir automaticamente.',
            inline: true,
          },
        ],
        hint: 'Use `/queue` para revisar a fila ou `/loop` sem parametros para consultar o estado atual.',
      });
    },

    async shuffle(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const pendingCount = queue.size;
      queue.toggleShuffle(false);
      return notice('success', 'PHONIX | Fila embaralhada', 'A ordem das proximas faixas foi reorganizada sem interromper a musica atual.', {
        fields: [
          {
            name: 'Escopo do embaralhamento',
            value: `O PHONIX reorganizou **${pendingCount}** faixa(s) que ainda estavam aguardando na fila.`,
            inline: false,
          },
        ],
        hint: 'Use `/queue` para revisar a nova ordem da fila.',
      });
    },

    async remove(input: RemoveInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const track = queue.tracks.at(input.index - 1);
      if (!track) {
        throw new ValidationCommandError('Nao existe faixa nessa posicao.');
      }

      queue.node.remove(track);
      return notice('success', 'PHONIX | Faixa removida', `**${track.title}** saiu da fila na posicao **${input.index}**.`, {
        fields: [
          {
            name: 'Fila atual',
            value: [`Posicao removida: **${input.index}**`, `Faixas ainda aguardando: **${queue.size}**`].join('\n'),
            inline: true,
          },
        ],
        hint: 'Use `/queue` para revisar as proximas faixas ou `/clear` se quiser limpar tudo de uma vez.',
      });
    },

    async clear(input: PlaybackBaseInput): Promise<PlaybackActionResult> {
      const queue = requireActiveQueue(deps, input);
      const removedCount = queue.size;
      queue.clear();
      return notice('success', 'PHONIX | Fila limpa', 'As proximas faixas foram removidas e a musica atual continua tocando normalmente.', {
        fields: [
          {
            name: 'Resultado da limpeza',
            value: `Faixas removidas da espera: **${removedCount}**`,
            inline: true,
          },
          {
            name: 'O que foi preservado',
            value: 'A musica atual continua tocando; somente o restante da fila foi limpo.',
            inline: true,
          },
        ],
        hint: 'Use `/play` para adicionar mais musicas ou `/stop` se quiser encerrar a sessao inteira.',
      });
    },
  };
}

function requireActiveQueue(
  deps: PlaybackUseCaseDeps,
  input: PlaybackBaseInput,
  options: { requireTrackOrItems?: boolean } = {},
): GuildQueue<QueueMetadata> {
  const queue = deps.player.nodes.get<QueueMetadata>(input.guildId);
  const requireTrackOrItems = options.requireTrackOrItems ?? true;

  if (!queue || (requireTrackOrItems && !queue.currentTrack && queue.size === 0)) {
    throw new PreconditionCommandError('Ainda nao existe fila ativa neste servidor. Use `/play` ou `!tocar` para iniciar uma reproducao.', {
      title: 'Fila vazia',
    });
  }

  if (queue.channel) {
    deps.music.ensureSameVoiceChannel(input.member);
  }

  return queue;
}

function notice(
  variant: 'success' | 'info' | 'warning',
  title: string,
  description: string,
  options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
): PlaybackActionResult {
  return {
    kind: 'notice',
    variant,
    title,
    description,
    fields: options.fields,
    hint: options.hint ?? null,
  };
}

function toPlayResultView(result: Awaited<ReturnType<MusicService['play']>>): PlayResultView {
  const description = buildPlayDescription(result);
  const entry = buildPlayEntryView(result);

  return {
    kind: 'play',
    title: buildPlayTitle(result),
    description,
    track: toTrackCardView(result.track, {
      sourceLabel: formatSourceLabel(result.provider, { routeKind: result.routeKind }),
    }),
    resultType: result.resultType,
    mode: result.mode,
    source: result.source,
    startedPlayback: result.startedPlayback,
    addedCount: result.addedCount,
    requestedCount: result.requestedCount,
    truncatedCount: result.truncatedCount,
    queuePosition: result.queuePosition,
    estimatedWait: result.estimatedWait,
    voiceChannelName: result.voiceChannelName,
    autoplayEnabled: result.autoplayEnabled,
    sourceRouteKind: result.routeKind,
    sourceDetail: buildPlaySourceDetail(result),
    entry,
    hint: result.hint ?? buildPlayHint(result),
  };
}

function buildPlayTitle(result: Awaited<ReturnType<MusicService['play']>>) {
  if (result.mode === 'replace') {
    return 'PHONIX | Fila substituida';
  }

  if (result.startedPlayback && result.resultType === 'playlist') {
    return 'PHONIX | Playlist iniciada';
  }

  if (result.startedPlayback) {
    return 'PHONIX | Tocando agora';
  }

  if (result.mode === 'next' && result.resultType === 'playlist') {
    return 'PHONIX | Playlist sera a proxima';
  }

  if (result.mode === 'next') {
    return 'PHONIX | Faixa sera a proxima';
  }

  if (result.resultType === 'playlist') {
    return 'PHONIX | Playlist adicionada';
  }

  return 'PHONIX | Faixa adicionada';
}

function buildPlayDescription(result: Awaited<ReturnType<MusicService['play']>>) {
  const channelContext = result.voiceChannelName ? ` em **${result.voiceChannelName}**` : '';
  let description: string;

  if (result.startedPlayback) {
    if (result.resultType === 'playlist') {
      description = `A playlist assumiu a sessao${channelContext} com **${result.addedCount}** faixa(s) prontas para tocar.`;
    } else {
      description = `A faixa entrou no ar agora${channelContext} e a sessao segue pronta para novas entradas.`;
    }
  } else if (result.mode === 'next') {
    if (result.resultType === 'playlist') {
      description = `A playlist entrou logo depois da faixa atual${channelContext} com **${result.addedCount}** faixa(s) encaixadas na sessao.`;
    } else {
      description = `A faixa entrou para tocar logo depois da atual${channelContext}.`;
    }
  } else if (result.mode === 'replace') {
    if (result.resultType === 'playlist') {
      description = `A fila atual foi substituida${channelContext} por **${result.addedCount}** faixa(s) e a sessao foi reorganizada a partir desta busca.`;
    } else {
      description = `A fila atual foi substituida${channelContext} e a nova faixa entrou imediatamente.`;
    }
  } else if (result.resultType === 'playlist') {
    description = `Playlist adicionada ao fim da fila${channelContext} com **${result.addedCount}** faixa(s) prontas para continuar a sessao.`;
  } else {
    description = `Faixa adicionada ao fim da fila${channelContext}.`;
  }

  if (result.truncatedCount > 0) {
    description += ` O PHONIX aplicou o limite seguro da fila e adicionou **${result.addedCount}** de **${result.requestedCount}** faixa(s).`;
  }

  if (result.pipeline === 'spotify-bridge') {
    description += ' O link do Spotify foi resolvido por bridge; o PHONIX usa os metadados do Spotify, mas toca por uma origem compativel em vez do source original.';
  }

  if (result.startedPlayback && result.entry.preparedVoiceConnection) {
    description += ' O PHONIX preparou a conexao do canal nesta mesma solicitacao.';
  }

  if (result.startedPlayback && result.entry.awaitedPlaybackStart) {
    description += ' O inicio real do playback foi confirmado antes da resposta.';
  }

  if (result.entry.compatibilityFallbackUsed) {
    description += ' O runtime degradou o YouTube para compatibility nesta tentativa para evitar que a sessao morresse no primeiro stream.';
  }

  return description;
}

function buildPlaySourceDetail(result: Awaited<ReturnType<MusicService['play']>>) {
  if (result.pipeline === 'spotify-bridge') {
    return 'Spotify hoje funciona por bridge: o link resolve metadados, mas o audio nao sai do source original do Spotify.';
  }

  return null;
}

function buildPlayHint(result: Awaited<ReturnType<MusicService['play']>>) {
  if (result.entry.compatibilityFallbackUsed && result.startedPlayback) {
    return 'Use `/nowplaying` para confirmar a sessao atual e `/doctor` se quiser revisar o downgrade de pipeline aplicado nesta tentativa.';
  }

  if (result.startedPlayback && result.resultType === 'playlist') {
    return 'Use `/queue` para revisar a ordem completa da playlist, `/shuffle` se quiser embaralhar as proximas faixas ou `/nowplaying` para focar na musica atual.';
  }

  if (result.startedPlayback) {
    return 'Use `/nowplaying` para focar na faixa atual, `/queue` para revisar o restante da sessao ou `/favorite add` se quiser guardar este atalho.';
  }

  if (result.mode === 'next') {
    return 'Use `/queue` para confirmar que a entrada ficou logo depois da atual, ou `/skip` se quiser adiantar a troca agora.';
  }

  if (result.mode === 'replace') {
    return 'A sessao atual foi trocada. Use `/queue` para revisar a nova ordem ou `/nowplaying` para confirmar o que entrou no ar.';
  }

  if (result.resultType === 'playlist') {
    return 'Use `/queue` para ver onde a playlist entrou, `/shuffle` se quiser embaralhar as proximas faixas ou `/skip` para adiantar a troca.';
  }

  return 'Use `/queue` para revisar a fila, `/nowplaying` para focar na musica atual ou `/play mode:next` para encaixar outra faixa logo em seguida.';
}

function toQueueView(queue: GuildQueue<QueueMetadata>, diagnostics: PlaybackSessionDiagnostics, music: MusicService): QueueView {
  const current = queue.currentTrack;
  const currentRoute = current ? music.inferTrackRoute?.(current) ?? inferTrackPlaybackRoute(current) : null;
  const visibleUpcoming = queue.tracks.toArray().slice(0, 10);
  const upcomingTracks: QueueEntryView[] = queue.tracks
    .toArray()
    .slice(0, 10)
    .map((track, index) => ({
      position: index + 1,
      title: track.title,
      duration: track.duration,
    }));

  return {
    kind: 'queue',
    title: 'PHONIX | Fila ativa',
    description: current
      ? `Sessao ativa em **${queue.channel?.name ?? 'canal nao identificado'}**. O PHONIX mostra o que esta tocando agora, o que vem depois e como a sessao esta se comportando.`
      : 'A fila existe, mas nenhuma faixa entrou no ar ainda. Use `/play` ou `!tocar` para iniciar a sessao.',
    currentTrack: current
      ? toTrackCardView(current, {
          sourceLabel: currentRoute ? formatSourceLabel(currentRoute.provider, { routeKind: currentRoute.routeKind }) : null,
        })
      : null,
    currentProgressBar: current ? (queue.node.createProgressBar?.() ?? 'Progresso indisponivel.') : null,
    upcomingTracks,
    size: queue.size,
    durationFormatted: queue.durationFormatted,
    hiddenTrackCount: Math.max(queue.size - visibleUpcoming.length, 0),
    volume: queue.node.volume,
    voiceChannelName: queue.channel?.name ?? null,
    repeatModeLabel: resolveLoopModeLabel(queue.repeatMode),
    autoplayEnabled: queue.repeatMode === QueueRepeatMode.AUTOPLAY,
    session: buildSessionStatusView(diagnostics, music, current),
  };
}

function toNowPlayingView(queue: GuildQueue<QueueMetadata>, diagnostics: PlaybackSessionDiagnostics, music: MusicService): NowPlayingView {
  const track = queue.currentTrack;
  const nextTrack = queue.tracks.at(0);
  const trackRoute = track ? music.inferTrackRoute?.(track) ?? inferTrackPlaybackRoute(track) : null;

  return {
    kind: 'nowPlaying',
    title: track ? 'PHONIX | Tocando agora' : 'PHONIX | Nada tocando',
    description: track
      ? `**${track.title}** esta tocando agora em **${queue.channel?.name ?? 'canal nao identificado'}**.`
      : 'A fila ainda nao iniciou nenhuma faixa. Use `/play` ou `!tocar` para comecar.',
    track: track
      ? toTrackCardView(track, {
          sourceLabel: trackRoute ? formatSourceLabel(trackRoute.provider, { routeKind: trackRoute.routeKind }) : null,
        })
      : null,
    progressBar: track ? (queue.node.createProgressBar?.() ?? 'Progresso indisponivel.') : null,
    volume: queue.node.volume,
    voiceChannelName: queue.channel?.name ?? null,
    queueSize: queue.size,
    durationFormatted: queue.durationFormatted,
    repeatModeLabel: resolveLoopModeLabel(queue.repeatMode),
    autoplayEnabled: queue.repeatMode === QueueRepeatMode.AUTOPLAY,
    nextTrack: nextTrack
      ? {
          position: 1,
          title: nextTrack.title,
          duration: nextTrack.duration,
        }
      : null,
    session: buildSessionStatusView(diagnostics, music, track),
  };
}

function buildSessionStatusView(
  diagnostics: PlaybackSessionDiagnostics,
  music: MusicService,
  currentTrack?: { url?: string; raw?: Record<string, unknown> | null } | null,
): SessionStatusView {
  const route = music.inferTrackRoute?.(currentTrack ?? null) ?? inferTrackPlaybackRoute(currentTrack ?? null);
  const lastRecoverySummary =
    diagnostics.lastRecoveryRecoveredTrackCount > 0 || diagnostics.lastRecoverySkippedTrackCount > 0
      ? `${diagnostics.lastRecoveryRecoveredTrackCount} restaurada(s) e ${diagnostics.lastRecoverySkippedTrackCount} pulada(s)`
      : diagnostics.lastRecoveryStatus === 'running'
        ? 'Recovery em andamento'
        : 'Sem resultado recente';

  return {
    stateLabel: formatSessionStateLabel(diagnostics.state),
    healthLabel: formatSessionHealthLabel(diagnostics.health),
    summary: diagnostics.healthDetail,
    persistedItemCount: diagnostics.itemCount,
    liveItemCount: diagnostics.liveItemCount,
    recoveryReady: diagnostics.recoveryReady,
    manualInterventionRequired: diagnostics.manualInterventionRequired,
    lastRecoveryLabel: formatRecoveryStatusLabel(diagnostics.lastRecoveryStatus),
    lastRecoverySummary,
    currentRouteLabel:
      route.provider === 'unknown' ? null : `${route.provider}/${route.pipeline}${route.routeKind === 'bridge' ? ' (bridge)' : ''}`,
  };
}

function buildPlayEntryView(result: Awaited<ReturnType<MusicService['play']>>) {
  return {
    connection: result.entry.preparedVoiceConnection
      ? 'A conexao de voz precisou ser preparada nesta solicitacao.'
      : 'A sessao de voz ja estava pronta antes desta entrada.',
    session:
      result.mode === 'replace'
        ? 'A busca atual substituiu a fila anterior e virou a nova base da sessao.'
        : result.startedPlayback
          ? result.entry.reusedActiveQueue
            ? 'A faixa assumiu a sessao que ja existia neste canal.'
            : 'Esta entrada iniciou a sessao atual do PHONIX neste canal.'
          : result.mode === 'next'
            ? 'A entrada ficou logo depois da faixa atual sem quebrar o playback em andamento.'
            : 'A sessao ativa foi reaproveitada e a entrada ficou aguardando na fila.',
    startup:
      result.startedPlayback && result.entry.awaitedPlaybackStart
        ? 'O PHONIX aguardou o start real da faixa antes de responder.'
        : result.startedPlayback
          ? 'A faixa ja estava no ar quando esta resposta foi emitida.'
          : 'A faixa nao interrompeu o que ja estava tocando; ela ficou preparada para a vez dela.',
    runtime: result.entry.compatibilityFallbackUsed
      ? 'O YouTube foi degradado para compatibility nesta tentativa para estabilizar a reproducao.'
      : null,
  };
}

function resolveLoopModeLabel(repeatMode: QueueRepeatMode) {
  if (repeatMode === QueueRepeatMode.TRACK) {
    return 'repetir faixa';
  }

  if (repeatMode === QueueRepeatMode.QUEUE) {
    return 'repetir fila';
  }

  if (repeatMode === QueueRepeatMode.AUTOPLAY) {
    return 'autoplay';
  }

  return 'desativado';
}

function formatSessionStateLabel(state: PlaybackSessionDiagnostics['state']) {
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

function formatSessionHealthLabel(health: PlaybackSessionDiagnostics['health']) {
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

function formatRecoveryStatusLabel(status: PlaybackSessionDiagnostics['lastRecoveryStatus']) {
  if (status === 'success') {
    return 'sucesso';
  }

  if (status === 'failed') {
    return 'falhou';
  }

  if (status === 'running') {
    return 'em andamento';
  }

  if (status === 'aborted') {
    return 'abortado';
  }

  return 'nenhum';
}

function formatEnabled(value: boolean) {
  return value ? 'sim' : 'nao';
}

function toRecoverView(result: PlaybackRecoveryResult): RecoverView {
  const highlightedTrack = result.session?.currentTrack ?? result.session?.items.at(0)?.track ?? null;

  return {
    kind: 'recover',
    variant: result.sessionHealth === 'partial' ? 'warning' : 'success',
    title: result.sessionHealth === 'partial' ? 'PHONIX | Sessao restaurada com ressalvas' : 'PHONIX | Sessao recuperada',
    description:
      result.sessionHealth === 'partial'
        ? `A sessao voltou para o seu canal, mas apenas **${result.recoveredTrackCount}** de **${result.requestedTrackCount}** faixa(s) continuaram tocaveis.`
        : `A fila salva voltou para o seu canal com **${result.recoveredTrackCount}** faixa(s) restaurada(s).`,
    track: highlightedTrack
      ? toTrackCardView(highlightedTrack, {
          sourceLabel: formatSourceLabel(highlightedTrack.source),
        })
      : null,
    summaryLines: [
      `Faixas salvas: **${result.requestedTrackCount}**`,
      `Restauradas: **${result.recoveredTrackCount}**`,
      `Puladas: **${result.skippedTrackCount}**`,
      `Faixa atual salva: **${formatEnabled(result.restoredCurrentTrack)}**`,
      `Fila reaproveitada agora: **${result.restoredUpcomingTrackCount}** faixa(s)`,
      `Tentativas nesta rodada: **${result.attemptCount}**`,
    ],
    settingsLines: [
      `Volume reaplicado: **${result.volume}%**`,
      `Loop reaplicado: **${resolveLoopModeLabel(result.repeatMode)}**`,
      `Autoplay reaplicado: **${formatEnabled(result.autoplayEnabled)}**`,
      `Recovery automatico: **${formatEnabled(result.autoRecovered)}**`,
    ],
    sessionLines: [
      `Saude: **${formatSessionHealthLabel(result.sessionHealth)}**`,
      `Intervencao manual: **${formatEnabled(result.manualInterventionRequired)}**`,
      result.healthDetail,
    ],
    hint:
      result.sessionHealth === 'partial'
        ? 'Use `/queue` e `/nowplaying` para revisar o que voltou. Se a ordem recuperada nao estiver suficiente, monte uma nova fila e deixe o PHONIX gravar uma sessao mais saudavel.'
        : 'Use `/queue` para revisar a fila restaurada, `/nowplaying` para focar na faixa atual ou `/doctor` se quiser revisar a saude da sessao.',
  };
}

function mapRecoverError(error: unknown) {
  if (!(error instanceof Error)) {
    return new ValidationCommandError('Nao foi possivel recuperar a sessao salva agora.', {
      title: 'Recovery indisponivel',
    });
  }

  if (/nao existe sessao pendente para recuperar/iu.test(error.message)) {
    return new PreconditionCommandError(error.message, {
      title: 'Nenhuma sessao pendente',
    });
  }

  if (/ja existe uma fila ativa ou recovery em andamento/iu.test(error.message)) {
    return new ValidationCommandError(error.message, {
      title: 'Sessao ja esta ativa',
    });
  }

  return error;
}
