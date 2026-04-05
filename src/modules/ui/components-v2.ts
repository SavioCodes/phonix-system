import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from '@discordjs/builders';
import { MessageFlags, type MessageCreateOptions } from 'discord.js';
import type {
  DoctorResultView,
  GuildConfigResult,
  NowPlayingView,
  PlayResultView,
  QueueView,
  TrackCardView,
} from './view-models.js';
import { theme } from './theme.js';

type ComponentsV2Payload = {
  components?: MessageCreateOptions['components'];
  flags?: number;
};

export const componentsV2 = {
  playResult(view: PlayResultView): ComponentsV2Payload {
    const container = createPanelContainer(playResultColor(view));

    container
      .addTextDisplayComponents(
        panelHeader('Playback Surface', view.title, view.description),
      )
      .addSeparatorComponents(panelSeparator())
      .addSectionComponents(
        detailSection(
          'Faixa escolhida',
          [
            `**${view.track.title}**`,
            `Autor: **${view.track.author || 'Desconhecido'}**`,
            `Duracao: **${view.track.duration}**`,
            view.track.sourceLabel ? `Origem: **${view.track.sourceLabel}**` : null,
            view.track.url ? `[Abrir no source](${view.track.url})` : null,
          ],
          view.track.thumbnail,
          view.track.title,
        ),
      );

    if ((view.startedPlayback || view.mode === 'replace') && view.track.thumbnail) {
      container.addMediaGalleryComponents(trackMedia(view.track));
    }

    container
      .addSeparatorComponents(panelSeparator())
      .addTextDisplayComponents(
        textBlock('Entrada do PHONIX', [
          view.entry.connection,
          view.entry.session,
          view.entry.startup,
          view.entry.runtime,
        ]),
        textBlock('Entrada na sessao', [
          `Status: **${view.startedPlayback ? 'tocando agora' : 'aguardando na fila'}**`,
          `Modo: **${formatPlayMode(view.mode)}**`,
          `Tipo: **${view.resultType === 'playlist' ? 'playlist' : 'faixa'}**`,
        ]),
        textBlock('Origem e entrega', [
          `Origem: **${formatPlaySource(view)}**`,
          `Entrega: **${formatRouteKind(view.sourceRouteKind)}**`,
          `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
        ]),
        textBlock('Fila e timing', [
          view.voiceChannelName ? `Canal: **${view.voiceChannelName}**` : null,
          view.queuePosition !== null ? `Posicao na fila: **${view.queuePosition}**` : null,
          view.estimatedWait ? `Toca em: **${view.estimatedWait}**` : null,
          `Faixas adicionadas: **${view.addedCount}**`,
          `Busca pedida: **${view.requestedCount}**`,
          view.truncatedCount > 0 ? `Limite seguro: **${view.truncatedCount}** faixa(s) ficaram de fora.` : null,
        ]),
      );

    if (view.sourceDetail) {
      container.addTextDisplayComponents(textBlock('Clareza de source', [view.sourceDetail]));
    }

    if (view.hint) {
      container.addTextDisplayComponents(textBlock('Proximo passo', [view.hint]));
    }

    return panelPayload(container);
  },

  queueView(view: QueueView): ComponentsV2Payload {
    const container = createPanelContainer(theme.colors.cyanSignal);

    container
      .addTextDisplayComponents(
        panelHeader('Queue Surface', view.title, view.description),
      )
      .addSeparatorComponents(panelSeparator())
      .addSectionComponents(
        detailSection(
          'Tocando agora',
          view.currentTrack
            ? [
                `**${view.currentTrack.title}**`,
                `Autor: **${view.currentTrack.author || 'Desconhecido'}**`,
                `Duracao: **${view.currentTrack.duration}**`,
                view.currentTrack.sourceLabel ? `Origem: **${view.currentTrack.sourceLabel}**` : null,
                buildTrackLinkLine(view.currentTrack),
                view.currentProgressBar ?? 'Progresso indisponivel.',
              ]
            : ['Nenhuma faixa tocando no momento.'],
          view.currentTrack?.thumbnail ?? null,
          view.currentTrack?.title ?? 'Fila ativa',
        ),
      )
      .addTextDisplayComponents(
        textBlock(
          'Proximas faixas',
          view.upcomingTracks.length > 0
            ? [
                ...view.upcomingTracks.map((track) => `${track.position}. **${track.title}** - ${track.duration}`),
                view.hiddenTrackCount > 0 ? `...e mais **${view.hiddenTrackCount}** faixa(s) aguardando.` : null,
              ]
            : ['A fila nao tem proximas faixas. Use `/play`, `!tocar`, `/favorite play` ou `/playlist play` para continuar.'],
        ),
        textBlock('Playback agora', [
          `Canal: **${view.voiceChannelName ?? 'nao identificado'}**`,
          `Volume: **${view.volume}%**`,
          `Loop: **${view.repeatModeLabel}**`,
          `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
          `Faixas na fila: **${view.size}**`,
          `Duracao estimada: **${view.durationFormatted}**`,
        ]),
        textBlock('Session snapshot', [
          `Saude: **${view.session.healthLabel}**`,
          `Estado: **${view.session.stateLabel}**`,
          `Sessao salva: **${view.session.persistedItemCount}** faixa(s)`,
          `Fila ao vivo: **${view.session.liveItemCount}** faixa(s)`,
          view.session.currentRouteLabel ? `Rota atual: **${view.session.currentRouteLabel}**` : null,
        ]),
        textBlock('Recovery', [
          `Ultimo recovery: **${view.session.lastRecoveryLabel}**`,
          `Resultado: **${view.session.lastRecoverySummary}**`,
          `Pronta para recover: **${formatEnabled(view.session.recoveryReady)}**`,
          `Intervencao manual: **${formatEnabled(view.session.manualInterventionRequired)}**`,
        ]),
        textBlock('Leitura operacional', [view.session.summary]),
        textBlock('Proximo passo', [
          buildSessionHint({
            hasCurrentTrack: Boolean(view.currentTrack),
            sessionHealth: view.session.healthLabel,
            recoveryReady: view.session.recoveryReady,
            manualInterventionRequired: view.session.manualInterventionRequired,
            fallback:
              'Use `/nowplaying` para focar na faixa atual, `/skip` para avancar ou `/clear` se quiser limpar apenas o restante da fila.',
          }),
        ]),
      );

    return panelPayload(container);
  },

  nowPlayingView(view: NowPlayingView): ComponentsV2Payload {
    const container = createPanelContainer(theme.colors.electricBlue);

    container.addTextDisplayComponents(
      panelHeader('Now Playing Surface', view.title, view.description),
    );

    if (!view.track) {
      container
        .addSeparatorComponents(panelSeparator())
        .addTextDisplayComponents(
          textBlock('Como comecar', [
            '`/play lo-fi hip hop`',
            '`!tocar lo-fi hip hop`',
            '`/recover`',
          ]),
        );

      return panelPayload(container);
    }

    container
      .addSeparatorComponents(panelSeparator())
      .addSectionComponents(
        detailSection(
          'Agora no ar',
          [
            `**${view.track.title}**`,
            `Autor: **${view.track.author || 'Desconhecido'}**`,
            `Duracao: **${view.track.duration}**`,
            view.track.sourceLabel ? `Origem: **${view.track.sourceLabel}**` : null,
            buildTrackLinkLine(view.track),
          ],
          view.track.thumbnail,
          view.track.title,
        ),
      );

    if (view.track.thumbnail) {
      container.addMediaGalleryComponents(trackMedia(view.track));
    }

    container.addTextDisplayComponents(
      textBlock('Progresso', [view.progressBar ?? 'Progresso indisponivel.']),
      textBlock('Playback agora', [
        `Canal: **${view.voiceChannelName ?? 'nao identificado'}**`,
        `Volume: **${view.volume}%**`,
        `Loop: **${view.repeatModeLabel}**`,
        `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
        `Faixas aguardando: **${view.queueSize}**`,
        `Duracao da fila: **${view.durationFormatted}**`,
      ]),
      textBlock('Session snapshot', [
        `Saude: **${view.session.healthLabel}**`,
        `Estado: **${view.session.stateLabel}**`,
        `Sessao salva: **${view.session.persistedItemCount}** faixa(s)`,
        `Fila ao vivo: **${view.session.liveItemCount}** faixa(s)`,
        view.session.currentRouteLabel ? `Rota atual: **${view.session.currentRouteLabel}**` : null,
      ]),
      textBlock('Recovery', [
        `Ultimo recovery: **${view.session.lastRecoveryLabel}**`,
        `Resultado: **${view.session.lastRecoverySummary}**`,
        `Pronta para recover: **${formatEnabled(view.session.recoveryReady)}**`,
        `Intervencao manual: **${formatEnabled(view.session.manualInterventionRequired)}**`,
      ]),
      textBlock('Proxima da fila', [
        view.nextTrack ? `**${view.nextTrack.title}** - ${view.nextTrack.duration}` : 'Nenhuma faixa definida depois da atual.',
      ]),
      textBlock('Leitura operacional', [view.session.summary]),
      textBlock('Proximo passo', [
        buildSessionHint({
          hasCurrentTrack: Boolean(view.track),
          sessionHealth: view.session.healthLabel,
          recoveryReady: view.session.recoveryReady,
          manualInterventionRequired: view.session.manualInterventionRequired,
          fallback:
            'Use `/queue` para revisar a fila completa, `/skip` para avancar ou `/volume 80` para ajustar a sessao sem interromper o playback.',
        }),
      ]),
    );

    return panelPayload(container);
  },

  settings(view: GuildConfigResult): ComponentsV2Payload {
    const container = createPanelContainer(theme.colors.electricBlue);

    container
      .addTextDisplayComponents(
        panelHeader(
          'Config Surface',
          'PHONIX | Configuracoes do servidor',
          'Defaults do servidor, estado da sessao persistida e atalhos administrativos para manter o playback previsivel.',
        ),
      )
      .addSeparatorComponents(panelSeparator())
      .addTextDisplayComponents(
        textBlock('Padroes do servidor', [
          `Prefixo: \`${view.settings.prefix}\``,
          `Volume padrao: **${view.settings.defaultVolume}%**`,
          `Autoplay padrao: **${formatEnabled(view.settings.autoplayEnabled)}**`,
          `Resume queue: **${formatEnabled(view.settings.resumeQueueEnabled)}**`,
        ]),
        textBlock('Playback agora', [
          view.liveVolume === null ? 'Nenhuma fila ativa no momento.' : `Fila ativa com volume em **${view.liveVolume}%** agora.`,
        ]),
        textBlock('Sessao persistida', [
          `Estado: **${formatSessionState(view.sessionDiagnostics.state)}**`,
          `Saude: **${formatSessionHealth(view.sessionDiagnostics.health)}**`,
          `Faixas salvas: **${view.sessionDiagnostics.itemCount}**`,
          `Fila ao vivo: **${view.sessionDiagnostics.liveItemCount}**`,
          `Ultima atualizacao: **${formatDiagnosticMoment(view.sessionDiagnostics.updatedAt)}**`,
        ]),
        textBlock('Recovery e retomada', [
          `Ultimo recovery: **${formatRecoveryStatus(view.sessionDiagnostics.lastRecoveryStatus)}**`,
          `Ultimo trigger: **${view.sessionDiagnostics.lastRecoveryTrigger ?? 'nenhum'}**`,
          `Resultado: **${view.sessionDiagnostics.lastRecoveryRecoveredTrackCount} restaurada(s), ${view.sessionDiagnostics.lastRecoverySkippedTrackCount} pulada(s)**`,
          `Pronta para recover: **${formatEnabled(view.sessionDiagnostics.recoveryReady)}**`,
          `Intervencao manual: **${formatEnabled(view.sessionDiagnostics.manualInterventionRequired)}**`,
          `Bloqueio recente: **${view.sessionDiagnostics.lastAutoRecoverBlockReason ?? 'nenhum'}**`,
        ]),
        textBlock('Leitura da sessao', [view.sessionDiagnostics.healthDetail]),
        textBlock('Ajustes rapidos', [
          '`/config view`',
          `\`/config prefix value:${view.settings.prefix}\``,
          '`/config volume value:80`',
          '`/config autoplay enabled:true`',
          '`/config resumequeue enabled:true`',
        ]),
      );

    return panelPayload(container);
  },

  doctor(report: DoctorResultView): ComponentsV2Payload {
    const color =
      report.overallStatus === 'error'
        ? theme.colors.alertCoral
        : report.overallStatus === 'warning'
          ? theme.colors.solarFlare
          : theme.colors.electricBlue;

    const container = createPanelContainer(color);

    container
      .addTextDisplayComponents(
        panelHeader(
          'Diagnostics Surface',
          'PHONIX | Diagnostico do sistema',
          [
            `Versao: **v${report.appVersion}**`,
            `Status geral: **${statusLabel(report.overallStatus)}**`,
            `Escopo slash: **${report.slashScope}**`,
            `Dashboard: **${report.dashboard.effectiveEnabled ? 'ativo' : report.dashboard.requestedEnabled ? 'solicitado, mas indisponivel' : 'desativado'}**`,
            `Resumo: **${report.summary.ok} OK**, **${report.summary.warning} avisos**, **${report.summary.error} erros**.`,
          ].join('\n'),
        ),
      )
      .addSeparatorComponents(panelSeparator())
      .addTextDisplayComponents(
        textBlock('Leitura rapida', [
          `Dashboard base URL: **${report.dashboard.baseUrl ?? 'nao definida'}**`,
          `Dashboard porta: **${report.dashboard.port}**`,
          `Motivo de indisponibilidade: **${report.dashboard.disableReason ?? 'nenhum'}**`,
        ]),
        textBlock('Runtime e deploy', [formatDoctorCategory(report, doctorRuntimeLabels)]),
        textBlock('Playback e sessao', [formatDoctorCategory(report, doctorPlaybackLabels)]),
        textBlock('Observabilidade', [formatDoctorCategory(report, doctorObservabilityLabels)]),
        textBlock('Erros ativos', [formatDoctorField(report, 'error')]),
        textBlock('Avisos ativos', [formatDoctorField(report, 'warning')]),
      );

    if (report.nextActions?.length) {
      container.addTextDisplayComponents(
        textBlock('Proximos passos', report.nextActions.map((action) => `- ${action}`)),
      );
    }

    return panelPayload(container);
  },
};

function createPanelContainer(color: number) {
  return new ContainerBuilder().setAccentColor(color);
}

function panelPayload(container: ContainerBuilder): ComponentsV2Payload {
  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  };
}

function panelHeader(surface: string, title: string, description: string) {
  return new TextDisplayBuilder().setContent(`**PHONIX | ${surface}**\n## ${title}\n${description}`);
}

function panelSeparator() {
  return new SeparatorBuilder().setDivider(true);
}

function detailSection(title: string, lines: Array<string | null | undefined>, artworkUrl?: string | null, artworkLabel?: string) {
  const section = new SectionBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`### ${title}\n${compactLines(lines).join('\n')}`),
  );

  if (artworkUrl) {
    section.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(artworkUrl)
        .setDescription(artworkLabel ?? title),
    );
  }

  return section;
}

function trackMedia(track: TrackCardView) {
  return new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder()
      .setURL(track.thumbnail)
      .setDescription(track.title),
  );
}

function textBlock(title: string, lines: Array<string | null | undefined>) {
  return new TextDisplayBuilder().setContent(`### ${title}\n${compactLines(lines).join('\n')}`);
}

function compactLines(lines: Array<string | null | undefined>) {
  return lines.filter((line): line is string => Boolean(line && line.trim()));
}

function buildTrackLinkLine(track: TrackCardView) {
  return track.url ? `[Abrir no source](${track.url})` : null;
}

function formatEnabled(value: boolean) {
  return value ? 'sim' : 'nao';
}

function formatPlayMode(mode: PlayResultView['mode']) {
  if (mode === 'next') {
    return 'entra em seguida';
  }

  if (mode === 'replace') {
    return 'substitui a fila';
  }

  return 'entra no fim';
}

function formatPlaySource(view: PlayResultView) {
  if (view.source === 'Spotify' && view.sourceRouteKind === 'bridge') {
    return 'Spotify (bridge)';
  }

  return view.source;
}

function formatRouteKind(routeKind: PlayResultView['sourceRouteKind']) {
  if (routeKind === 'bridge') {
    return 'bridge';
  }

  if (routeKind === 'native') {
    return 'nativa';
  }

  return 'desconhecida';
}

function playResultColor(view: PlayResultView) {
  if (view.mode === 'replace' || view.startedPlayback) {
    return theme.colors.electricBlue;
  }

  return theme.colors.cyanSignal;
}

function formatSessionState(state: GuildConfigResult['sessionDiagnostics']['state']) {
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

function formatSessionHealth(health: GuildConfigResult['sessionDiagnostics']['health']) {
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

function formatRecoveryStatus(status: GuildConfigResult['sessionDiagnostics']['lastRecoveryStatus']) {
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

function formatDiagnosticMoment(value: Date | null) {
  return value ? value.toISOString() : 'ainda nao registrada';
}

function buildSessionHint(input: {
  hasCurrentTrack: boolean;
  sessionHealth: string;
  recoveryReady: boolean;
  manualInterventionRequired: boolean;
  fallback: string;
}) {
  if (input.manualInterventionRequired) {
    return 'A sessao precisa de leitura manual. Use `/doctor` para entender o bloqueio e `/recover` apenas se o estado persistido ainda estiver aproveitavel.';
  }

  if (input.sessionHealth === 'parcial') {
    return 'O PHONIX detectou uma sessao parcial. Revise a fila visivel, confirme a ordem com `/queue` e use `/recover` so se ainda houver algo util para restaurar.';
  }

  if (input.sessionHealth === 'quebrada') {
    return 'A sessao atual parece inconsistente. Use `/doctor` para entender o ponto de quebra e recrie a fila se o recovery nao estiver mais confiavel.';
  }

  if (input.recoveryReady && !input.hasCurrentTrack) {
    return 'Existe uma sessao salva pronta para recover. Use `/recover` no seu canal atual para tentar retomar o estado persistido da guild.';
  }

  return input.fallback;
}

function formatDoctorField(report: DoctorResultView, status: DoctorResultView['overallStatus']) {
  const items = report.checks.filter((check) => check.status === status);
  if (items.length === 0) {
    return status === 'error' ? 'Nenhum erro ativo.' : status === 'warning' ? 'Nenhum aviso ativo.' : 'Nenhum item nesta categoria.';
  }

  return items.map((check) => `- **${check.label}**: ${check.detail}`).join('\n');
}

function formatDoctorCategory(report: DoctorResultView, labels: Set<string>) {
  const items = report.checks.filter((check) => labels.has(check.label));
  if (items.length === 0) {
    return 'Nenhum check desta area.';
  }

  return items
    .map((check) => `${statusPill(check.status)} **${check.label}** - ${truncate(check.detail, 100)}`)
    .join('\n');
}

function statusLabel(status: DoctorResultView['overallStatus']) {
  if (status === 'ok') {
    return 'OK';
  }

  if (status === 'warning') {
    return 'Aviso';
  }

  return 'Erro';
}

function statusPill(status: DoctorResultView['overallStatus']) {
  if (status === 'ok') {
    return '[OK]';
  }

  if (status === 'warning') {
    return '[WARN]';
  }

  return '[ERROR]';
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

const doctorRuntimeLabels = new Set([
  'Discord session',
  'Voice crypto',
  'FFmpeg',
  'Spotify',
  'Database',
  'Gateway intents',
  'Slash commands',
  'Dashboard admin center',
  'Text channel permissions',
]);

const doctorPlaybackLabels = new Set([
  'Playback pipeline',
  'Voice channel permissions',
  'Voice playback target',
  'Player state',
  'Playback session',
]);

const doctorObservabilityLabels = new Set([
  'Operational telemetry',
  'Runtime warnings',
]);
