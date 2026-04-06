import { EmbedBuilder, inlineCode } from 'discord.js';
import type { PlaybackSessionDiagnostics } from '../music/playbackSessionManager.js';
import type {
  DoctorResultView,
  GuildConfigResult,
  HelpPageId,
  HelpResultView,
  NoticeFieldView,
  NoticeView,
  NowPlayingView,
  PlayResultView,
  QueueView,
  TrackCardView,
} from './view-models.js';
import { theme } from './theme.js';

type NoticeVariant = NoticeView['variant'];

function baseEmbed(color: number, title: string, description?: string) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description ?? null)
    .setFooter({ text: theme.footerText, iconURL: theme.assets.logoUrl })
    .setTimestamp();
}

export const embeds = {
  success(title: string, description: string, options: { fields?: NoticeFieldView[]; hint?: string | null } = {}) {
    return buildNoticeEmbed({
      kind: 'notice',
      variant: 'success',
      title,
      description,
      fields: options.fields,
      hint: options.hint,
    });
  },

  info(title: string, description: string, options: { fields?: NoticeFieldView[]; hint?: string | null } = {}) {
    return buildNoticeEmbed({
      kind: 'notice',
      variant: 'info',
      title,
      description,
      fields: options.fields,
      hint: options.hint,
    });
  },

  warning(title: string, description: string, options: { fields?: NoticeFieldView[]; hint?: string | null } = {}) {
    return buildNoticeEmbed({
      kind: 'notice',
      variant: 'warning',
      title,
      description,
      fields: options.fields,
      hint: options.hint,
    });
  },

  notice(view: NoticeView) {
    return buildNoticeEmbed(view);
  },

  error(title: string, description: string) {
    return buildNoticeEmbed({
      kind: 'notice',
      variant: 'error',
      title,
      description,
      hint: 'Revise o contexto do comando, corrija o bloqueio acima e tente novamente. Se o problema persistir, rode `/doctor` para aprofundar o diagnostico.',
    });
  },

  help(view: HelpResultView = defaultHelpView()) {
    const page = view.pages[view.currentPage];
    const pageIndex = helpPageOrder.indexOf(view.currentPage);
    const embed = baseEmbed(
      helpPageColor(view.currentPage),
      page.title,
      page.description,
    )
      .setAuthor({
        name: 'PHONIX | Centro guiado',
        iconURL: theme.assets.avatarUrl,
      })
      .setThumbnail(theme.assets.avatarUrl)
      .setFooter({
        text: `PHONIX | Ajuda guiada | ${page.label} | ${pageIndex + 1}/${helpPageOrder.length}`,
        iconURL: theme.assets.logoUrl,
      });

    if (page.fields.length > 0) {
      embed.addFields(page.fields);
    }

    return embed.addFields(
      {
        name: 'Estado atual',
        value: [
          `Prefixo: ${inlineCode(view.prefix)}`,
          `Fila ativa: **${formatEnabled(view.hasActiveQueue)}**`,
          `Resume queue: **${formatEnabled(view.resumeQueueEnabled)}**`,
          `Sessao persistida: **${formatSessionState(view.sessionDiagnostics.state)}**`,
          `Saude da sessao: **${formatSessionHealth(view.sessionDiagnostics.health)}**`,
          `Pronta para recover: **${formatEnabled(view.sessionDiagnostics.recoveryReady)}**`,
          `Permissao admin: **${formatEnabled(view.memberIsAdmin)}**`,
          `Owner global: **${formatEnabled(view.memberIsOwner)}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Como navegar',
        value: 'Use os botoes abaixo para trocar entre Inicio, Playback, Biblioteca, Recovery e Admin sem precisar decorar os comandos de uma vez.',
        inline: false,
      },
    );
  },

  queueView(view: QueueView) {
    const currentTrackValue = view.currentTrack
      ? [
          buildTrackHeadline(view.currentTrack),
          `Artista: **${view.currentTrack.author || 'Desconhecido'}**`,
          `Duracao: **${view.currentTrack.duration}**`,
          view.currentTrack.sourceLabel ? `Origem: **${view.currentTrack.sourceLabel}**` : null,
          buildTrackLinkLine(view.currentTrack),
          view.currentProgressBar ?? 'Progresso indisponivel.',
        ]
          .filter(Boolean)
          .join('\n')
      : 'Nenhuma faixa tocando no momento. Use `/play` ou `!tocar` para iniciar a sessao.';

    const upcomingValue =
      view.upcomingTracks.length > 0
        ? [
            ...view.upcomingTracks.map((track) => `${track.position}. **${track.title}** - ${track.duration}`),
            view.hiddenTrackCount > 0 ? `...e mais **${view.hiddenTrackCount}** faixa(s) aguardando.` : null,
          ]
            .filter(Boolean)
            .join('\n')
        : 'A fila nao tem proximas faixas. Use `/play`, `!tocar`, `/favorite play` ou `/playlist play` para continuar.';

    const embed = baseEmbed(
      theme.colors.cyanSignal,
      view.title,
      view.description,
    );

    applyTrackArtwork(embed, view.currentTrack, 'thumbnail');

    return embed.addFields(
      {
        name: 'Tocando agora',
        value: currentTrackValue,
        inline: false,
      },
      {
        name: 'Proximas faixas',
        value: upcomingValue,
        inline: false,
      },
      {
        name: 'Playback agora',
        value: [
          `Estado: **${view.playbackStateLabel ?? 'desconhecido'}**`,
          `Canal: **${view.voiceChannelName ?? 'nao identificado'}**`,
          `Volume: **${view.volume}%**`,
          `Loop: **${view.repeatModeLabel}**`,
          `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Session snapshot',
        value: [
          `Saude: **${view.session.healthLabel}**`,
          `Estado: **${view.session.stateLabel}**`,
          `Sessao salva: **${view.session.persistedItemCount}** faixa(s)`,
          `Fila ao vivo: **${view.session.liveItemCount}** faixa(s)`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Recovery',
        value: [
          `Ultimo recovery: **${view.session.lastRecoveryLabel}**`,
          `Resultado: **${view.session.lastRecoverySummary}**`,
          `Pronta para recover: **${formatEnabled(view.session.recoveryReady)}**`,
          `Intervencao manual: **${formatEnabled(view.session.manualInterventionRequired)}**`,
          view.session.currentRouteLabel ? `Rota atual: **${view.session.currentRouteLabel}**` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        inline: true,
      },
      {
        name: 'Totais da fila',
        value: [
          `Faixas na fila: **${view.size}**`,
          `Duracao estimada: **${view.durationFormatted}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Leitura operacional',
        value: view.session.summary,
        inline: false,
      },
      {
        name: 'Proximo passo',
        value: buildSessionHint({
          hasCurrentTrack: Boolean(view.currentTrack),
          sessionHealth: view.session.healthLabel,
          recoveryReady: view.session.recoveryReady,
          manualInterventionRequired: view.session.manualInterventionRequired,
          fallback: 'Use `/nowplaying` para focar na faixa atual, `/skip` para avancar ou `/clear` se quiser limpar apenas o restante da fila.',
        }),
        inline: false,
      },
    );
  },

  nowPlayingView(view: NowPlayingView) {
    if (!view.track) {
      return baseEmbed(
        theme.colors.navyCore,
        'PHONIX | Nada tocando',
        'A fila ainda nao iniciou nenhuma faixa. Use `/play` ou `!tocar` para comecar a sessao neste canal.',
      ).addFields({
        name: 'Como comecar',
        value: [inlineCode('/play lo-fi hip hop'), inlineCode('!tocar lo-fi hip hop'), inlineCode('/recover')].join('\n'),
        inline: false,
      });
    }

    const embed = baseEmbed(
      theme.colors.electricBlue,
      view.title,
      view.description,
    );

    applyTrackArtwork(embed, view.track, 'image');

    return embed.addFields(
        {
          name: 'Agora no ar',
          value: [
            buildTrackHeadline(view.track),
            `Artista: **${view.track.author || 'Desconhecido'}**`,
            `Duracao: **${view.track.duration}**`,
            view.track.sourceLabel ? `Origem: **${view.track.sourceLabel}**` : null,
            buildTrackLinkLine(view.track),
          ]
            .filter(Boolean)
            .join('\n'),
          inline: false,
        },
        {
          name: 'Progresso',
          value: view.progressBar ?? 'Progresso indisponivel.',
          inline: false,
        },
        {
          name: 'Playback agora',
          value: [
            `Estado: **${view.playbackStateLabel ?? 'desconhecido'}**`,
            `Canal: **${view.voiceChannelName ?? 'nao identificado'}**`,
            `Volume: **${view.volume}%**`,
            `Loop: **${view.repeatModeLabel}**`,
            `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
            `Faixas aguardando: **${view.queueSize}**`,
            `Duracao da fila: **${view.durationFormatted}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Session snapshot',
          value: [
            `Saude: **${view.session.healthLabel}**`,
            `Estado: **${view.session.stateLabel}**`,
            `Sessao salva: **${view.session.persistedItemCount}** faixa(s)`,
            `Fila ao vivo: **${view.session.liveItemCount}** faixa(s)`,
          ].join('\n'),
          inline: true,
        },
        {
          name: 'Recovery',
          value: [
            `Ultimo recovery: **${view.session.lastRecoveryLabel}**`,
            `Resultado: **${view.session.lastRecoverySummary}**`,
            `Pronta para recover: **${formatEnabled(view.session.recoveryReady)}**`,
            `Intervencao manual: **${formatEnabled(view.session.manualInterventionRequired)}**`,
            view.session.currentRouteLabel ? `Rota atual: **${view.session.currentRouteLabel}**` : null,
          ]
            .filter(Boolean)
            .join('\n'),
          inline: true,
        },
        {
          name: 'Proxima da fila',
          value: view.nextTrack ? `**${view.nextTrack.title}** - ${view.nextTrack.duration}` : 'Nenhuma faixa definida depois da atual.',
          inline: false,
        },
        {
          name: 'Leitura operacional',
          value: view.session.summary,
          inline: false,
        },
        {
          name: 'Proximo passo',
          value: buildSessionHint({
            hasCurrentTrack: Boolean(view.track),
            sessionHealth: view.session.healthLabel,
            recoveryReady: view.session.recoveryReady,
            manualInterventionRequired: view.session.manualInterventionRequired,
            fallback: 'Use `/queue` para revisar a fila completa, `/skip` para avancar ou `/volume 80` para ajustar a sessao sem interromper o playback.',
          }),
          inline: false,
        },
      );
  },

  trackCard(
    title: string,
    track: TrackCardView,
    description: string,
    options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
  ) {
    const embed = applyTrackArtwork(baseEmbed(theme.colors.electricBlue, title, description), track, 'thumbnail')
      .addFields(
        {
          name: 'Faixa',
          value: [buildTrackHeadline(track), buildTrackLinkLine(track)].filter(Boolean).join('\n'),
          inline: false,
        },
        { name: 'Artista', value: track.author || 'Desconhecido', inline: true },
        { name: 'Duracao', value: track.duration, inline: true },
      );

    if (track.sourceLabel) {
      embed.addFields({
        name: 'Origem',
        value: track.sourceLabel,
        inline: true,
      });
    }

    if (options.fields?.length) {
      embed.addFields(options.fields);
    }

    embed.addFields({
      name: options.hint ? 'Proximo passo' : 'Atalho util',
      value: options.hint ?? [inlineCode('/queue'), inlineCode('/nowplaying'), inlineCode('/favorite list')].join('  '),
      inline: false,
    });

    return embed;
  },

  playResult(view: PlayResultView) {
    const entryLines = [
      `Status: **${view.startedPlayback ? 'tocando agora' : 'aguardando na fila'}**`,
      `Modo: **${formatPlayMode(view.mode)}**`,
      `Tipo: **${view.resultType === 'playlist' ? 'playlist' : 'faixa'}**`,
    ]
      .filter(Boolean)
      .join('\n');

    const sourceLines = [
      `Origem: **${formatPlaySource(view)}**`,
      `Entrega: **${formatRouteKind(view.sourceRouteKind)}**`,
      `Autoplay: **${formatEnabled(view.autoplayEnabled)}**`,
      view.sourceDetail ? 'Leitura: bridge/source explicados abaixo.' : null,
    ]
      .filter(Boolean)
      .join('\n');

    const queueTimingLines = [
      view.voiceChannelName ? `Canal: **${view.voiceChannelName}**` : null,
      view.queuePosition !== null ? `Posicao na fila: **${view.queuePosition}**` : null,
      view.estimatedWait ? `Toca em: **${view.estimatedWait}**` : null,
      `Faixas adicionadas: **${view.addedCount}**`,
      `Busca pedida: **${view.requestedCount}**`,
    ]
      .filter(Boolean)
      .join('\n');

    const embed = applyTrackArtwork(
      baseEmbed(playResultColor(view), view.title, view.description),
      view.track,
      view.startedPlayback || view.mode === 'replace' ? 'image' : 'thumbnail',
    )
      .addFields(
        {
          name: 'Faixa escolhida',
          value: [
            buildTrackHeadline(view.track),
            `Artista: **${view.track.author || 'Desconhecido'}**`,
            `Duracao: **${view.track.duration}**`,
            view.track.sourceLabel ? `Origem: **${view.track.sourceLabel}**` : null,
            buildTrackLinkLine(view.track),
          ]
            .filter(Boolean)
            .join('\n'),
          inline: false,
        },
        {
          name: 'Entrada do PHONIX',
          value: [
            view.entry.connection,
            view.entry.session,
            view.entry.startup,
            view.entry.runtime,
          ]
            .filter(Boolean)
            .join('\n'),
          inline: false,
        },
        {
          name: 'Entrada na sessao',
          value: entryLines,
          inline: true,
        },
        {
          name: 'Origem e entrega',
          value: sourceLines,
          inline: true,
        },
        {
          name: 'Fila e timing',
          value: queueTimingLines,
          inline: true,
        },
      );

    if (view.truncatedCount > 0) {
      embed.addFields({
        name: 'Resumo da entrada',
        value: [
          view.truncatedCount > 0
            ? `Limite seguro aplicado: **${view.truncatedCount}** faixa(s) ficaram de fora para manter a fila estavel.`
            : 'Nenhum truncamento foi necessario nesta entrada.',
        ].join('\n'),
        inline: false,
      });
    }

    if (view.sourceDetail) {
      embed.addFields({
        name: 'Clareza de source',
        value: view.sourceDetail,
        inline: false,
      });
    }

    if (view.hint) {
      embed.addFields({
        name: 'Proximo passo',
        value: view.hint,
        inline: false,
      });
    }

    return embed;
  },

  settings(view: GuildConfigResult) {
    return baseEmbed(
      theme.colors.electricBlue,
      'PHONIX | Configuracoes do servidor',
      'Defaults do servidor, estado da sessao persistida e atalhos administrativos para manter o playback previsivel.',
    ).addFields(
      {
        name: 'Padroes do servidor',
        value: [
          `Prefixo: ${inlineCode(view.settings.prefix)}`,
          `Volume padrao: **${view.settings.defaultVolume}%**`,
          `Autoplay padrao: **${formatEnabled(view.settings.autoplayEnabled)}**`,
          `Resume queue: **${formatEnabled(view.settings.resumeQueueEnabled)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Playback agora',
        value:
          view.liveVolume === null
            ? 'Nenhuma fila ativa no momento.'
            : `Fila ativa com volume em **${view.liveVolume}%** agora.`,
        inline: true,
      },
      {
        name: 'Sessao persistida',
        value: [
          `Estado: **${formatSessionState(view.sessionDiagnostics.state)}**`,
          `Saude: **${formatSessionHealth(view.sessionDiagnostics.health)}**`,
          `Faixas salvas: **${view.sessionDiagnostics.itemCount}**`,
          `Fila ao vivo: **${view.sessionDiagnostics.liveItemCount}**`,
          `Ultima atualizacao: **${formatDiagnosticMoment(view.sessionDiagnostics.updatedAt)}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'Recovery e retomada',
        value: [
          `Ultimo recovery: **${formatRecoveryStatus(view.sessionDiagnostics.lastRecoveryStatus)}**`,
          `Ultimo trigger: **${view.sessionDiagnostics.lastRecoveryTrigger ?? 'nenhum'}**`,
          `Resultado: **${view.sessionDiagnostics.lastRecoveryRecoveredTrackCount} restaurada(s), ${view.sessionDiagnostics.lastRecoverySkippedTrackCount} pulada(s)**`,
          `Pronta para recover: **${formatEnabled(view.sessionDiagnostics.recoveryReady)}**`,
          `Intervencao manual: **${formatEnabled(view.sessionDiagnostics.manualInterventionRequired)}**`,
          `Bloqueio recente: **${view.sessionDiagnostics.lastAutoRecoverBlockReason ?? 'nenhum'}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Leitura da sessao',
        value: view.sessionDiagnostics.healthDetail,
        inline: false,
      },
      {
        name: 'Ajustes rapidos',
        value: [
          inlineCode('/config view'),
          inlineCode(`/config prefix value:${view.settings.prefix}`),
          inlineCode('/config volume value:80'),
          inlineCode('/config autoplay enabled:true'),
          inlineCode('/config resumequeue enabled:true'),
        ].join('\n'),
        inline: false,
      },
    );
  },

  doctor(report: DoctorResultView) {
    const color =
      report.overallStatus === 'error'
        ? theme.colors.alertCoral
        : report.overallStatus === 'warning'
          ? theme.colors.solarFlare
          : theme.colors.electricBlue;

    const embed = baseEmbed(
      color,
      'PHONIX | Diagnostico do sistema',
      `Versao: **v${report.appVersion}**\nStatus geral: **${statusLabel(report.overallStatus)}**\nEscopo slash: **${report.slashScope}**\nDashboard: **${report.dashboard.effectiveEnabled ? 'ativo' : report.dashboard.requestedEnabled ? 'solicitado, mas indisponivel' : 'desativado'}**\nResumo: **${report.summary.ok} OK**, **${report.summary.warning} avisos**, **${report.summary.error} erros**.`,
    ).addFields(
      {
        name: 'Leitura rapida',
        value: [
          `Dashboard base URL: **${report.dashboard.baseUrl ?? 'nao definida'}**`,
          `Dashboard porta: **${report.dashboard.port}**`,
          `Motivo de indisponibilidade: **${report.dashboard.disableReason ?? 'nenhum'}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Runtime e deploy',
        value: formatDoctorCategory(report, doctorRuntimeLabels),
        inline: false,
      },
      {
        name: 'Playback e sessao',
        value: formatDoctorCategory(report, doctorPlaybackLabels),
        inline: false,
      },
      {
        name: 'Observabilidade',
        value: formatDoctorCategory(report, doctorObservabilityLabels),
        inline: false,
      },
      {
        name: 'Erros ativos',
        value: formatDoctorField(report, 'error'),
        inline: false,
      },
      {
        name: 'Avisos ativos',
        value: formatDoctorField(report, 'warning'),
        inline: false,
      },
    );

    if (report.nextActions?.length) {
      embed.addFields({
        name: 'Proximos passos',
        value: report.nextActions.map((action) => `- ${action}`).join('\n'),
        inline: false,
      });
    }

    return embed;
  },
};

function buildNoticeEmbed(view: NoticeView) {
  const spec = resolveNoticeSpec(view.variant);
  const embed = baseEmbed(spec.color, view.title, view.description).setAuthor({
    name: `PHONIX | ${spec.label}`,
    iconURL: theme.assets.avatarUrl,
  });

  embed.addFields({
    name: spec.summaryTitle,
    value: spec.contextHint,
    inline: false,
  });

  if (view.fields?.length) {
    embed.addFields(view.fields);
  }

  if (view.hint) {
    embed.addFields({
      name: spec.hintTitle,
      value: view.hint,
      inline: false,
    });
  }

  return embed;
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
    .map((check) => `${statusPill(check.status)} **${check.label}** - ${truncate(check.detail, 80)}`)
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

function formatSessionState(state: PlaybackSessionDiagnostics['state']) {
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

function formatSessionHealth(health: PlaybackSessionDiagnostics['health']) {
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

function formatRecoveryStatus(status: PlaybackSessionDiagnostics['lastRecoveryStatus']) {
  if (status === 'success') {
    return 'sucesso';
  }

  if (status === 'failed') {
    return 'falhou';
  }

  if (status === 'running') {
    return 'em andamento';
  }

  return 'nenhum';
}

function formatDiagnosticMoment(value: Date | null) {
  return value ? value.toISOString() : 'ainda nao registrada';
}

function defaultSessionDiagnostics(): PlaybackSessionDiagnostics {
  return {
    state: 'none',
    health: 'healthy',
    healthDetail: 'Nenhuma sessao persistida pendente no momento.',
    hasPersistedSession: false,
    hasActiveQueue: false,
    autoResumeEnabled: true,
    itemCount: 0,
    liveItemCount: 0,
    hasCurrentTrack: false,
    recoveryReady: false,
    manualInterventionRequired: false,
    stalePersistedSession: false,
    updatedAt: null,
    voiceChannelId: null,
    textChannelId: null,
    lastSyncReason: null,
    lastAutoRecoverBlockReason: null,
    lastRecoveryTrigger: null,
    lastRecoveryStatus: 'idle',
    lastRecoveryAttemptAt: null,
    lastRecoveryAttempts: 0,
    lastRecoveryDurationMs: null,
    lastSuccessfulRecoveryAt: null,
    lastRecoveryRecoveredTrackCount: 0,
    lastRecoverySkippedTrackCount: 0,
  };
}

function defaultHelpView(): HelpResultView {
  return {
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
      home: {
        id: 'home',
        label: 'Inicio',
        title: 'PHONIX | Central de Ajuda',
        description: 'Use /play ou !play para comecar a tocar musica.',
        fields: [],
      },
      playback: {
        id: 'playback',
        label: 'Playback',
        title: 'PHONIX | Playback',
        description: 'Controle a fila e a reproducao.',
        fields: [],
      },
      library: {
        id: 'library',
        label: 'Biblioteca',
        title: 'PHONIX | Biblioteca',
        description: 'Gerencie favoritos, playlists e historico.',
        fields: [],
      },
      recovery: {
        id: 'recovery',
        label: 'Recovery',
        title: 'PHONIX | Recovery',
        description: 'Recupere a ultima sessao persistida do servidor.',
        fields: [],
      },
      admin: {
        id: 'admin',
        label: 'Admin',
        title: 'PHONIX | Admin',
        description: 'Configuracoes e diagnostico do servidor.',
        fields: [],
      },
    },
    sessionDiagnostics: defaultSessionDiagnostics(),
  };
}

const helpPageOrder: HelpPageId[] = ['home', 'playback', 'library', 'recovery', 'admin'];

function helpPageColor(page: HelpPageId) {
  switch (page) {
    case 'playback':
      return theme.colors.cyanSignal;
    case 'library':
      return theme.colors.electricBlue;
    case 'recovery':
      return theme.colors.cyanSignal;
    case 'admin':
      return theme.colors.navyCore;
    default:
      return theme.colors.electricBlue;
  }
}

function playResultColor(view: PlayResultView) {
  if (view.mode === 'replace' || view.startedPlayback) {
    return theme.colors.electricBlue;
  }

  return theme.colors.cyanSignal;
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

function resolveNoticeSpec(variant: NoticeVariant) {
  if (variant === 'success') {
    return {
      color: theme.colors.electricBlue,
      label: 'Sucesso operacional',
      summaryTitle: 'Resultado confirmado',
      contextHint: 'Esta resposta confirma a operacao e deixa o proximo passo mais perto, sem obrigar voce a procurar o contexto em outras mensagens.',
      hintTitle: 'Proximo passo',
    };
  }

  if (variant === 'warning') {
    return {
      color: theme.colors.solarFlare,
      label: 'Atencao operacional',
      summaryTitle: 'O que merece atencao',
      contextHint: 'Esta resposta aponta um estado parcial, sensivel ou degradado. Vale conferir o bloco abaixo antes de seguir para a proxima acao.',
      hintTitle: 'Como estabilizar',
    };
  }

  if (variant === 'error') {
    return {
      color: theme.colors.alertCoral,
      label: 'Erro controlado',
      summaryTitle: 'O que bloqueou',
      contextHint:
        'Esta tentativa parou antes de aplicar a operacao. O bloco abaixo resume o bloqueio real e o caminho mais seguro para retomar.',
      hintTitle: 'Como destravar agora',
    };
  }

  return {
    color: theme.colors.cyanSignal,
    label: 'Leitura operacional',
    summaryTitle: 'Leitura rapida',
    contextHint: 'Esta resposta nao representa erro; ela existe para esclarecer o estado atual da sessao ou do comando.',
    hintTitle: 'Atalho util',
  };
}

function formatEnabled(value: boolean) {
  return value ? 'sim' : 'nao';
}

function applyTrackArtwork(embed: EmbedBuilder, track: TrackCardView | null, mode: 'thumbnail' | 'image') {
  const artwork = track?.thumbnail?.trim();
  if (!artwork) {
    return embed;
  }

  if (mode === 'image') {
    embed.setImage(artwork);
    return embed;
  }

  embed.setThumbnail(artwork);
  return embed;
}

function buildTrackHeadline(track: TrackCardView) {
  return `**${track.title}**`;
}

function buildTrackLinkLine(track: TrackCardView) {
  return track.url ? `[Abrir no source](${track.url})` : null;
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

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(0, maxLength - 3))}...`;
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

function formatRouteKind(routeKind: PlayResultView['sourceRouteKind']) {
  if (routeKind === 'bridge') {
    return 'bridge';
  }

  if (routeKind === 'native') {
    return 'nativa';
  }

  return 'desconhecida';
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
