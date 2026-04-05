import type { PrismaClient } from '@prisma/client';
import type { Player } from 'discord-player';
import {
  Collection,
  GatewayIntentBits,
  IntentsBitField,
  PermissionFlagsBits,
  type Client,
  type Guild,
  type GuildMember,
  type Snowflake,
  type VoiceBasedChannel,
} from 'discord.js';
import { resolveDashboardConfig, type AppConfig } from '../../../core/config/env.js';
import { APP_VERSION } from '../../../core/config/version.js';
import type { GuildSettingsService } from '../../library/services/guildSettingsService.js';
import type { PlaybackSessionsService } from '../../library/services/playbackSessionsService.js';
import type { OperationalTelemetryService } from './operationalTelemetryService.js';
import type { OperationalTelemetryStoreService } from './operationalTelemetryStoreService.js';
import type { PlaybackSessionManager } from '../../music/playbackSessionManager.js';
import type { FfmpegStatus } from '../../music/ffmpeg.js';
import { getVoiceCryptoRuntimeStatus, prepareVoiceCryptoRuntime } from '../../music/daveRuntime.js';
import { describeConfiguredPlaybackRoutes, type MusicService } from '../../music/musicService.js';

type DoctorStatus = 'ok' | 'warning' | 'error';

interface DoctorRunInput {
  client: Client;
  guild: Guild;
  member?: GuildMember | null;
  textChannelId?: string | null;
  voiceChannelId?: Snowflake | null;
}

interface DoctorCheck {
  label: string;
  status: DoctorStatus;
  detail: string;
}

interface DoctorReportSummary {
  ok: number;
  warning: number;
  error: number;
}

export interface DoctorReport {
  appVersion: string;
  overallStatus: DoctorStatus;
  summary: DoctorReportSummary;
  slashScope: 'guild' | 'global' | 'mismatch';
  dashboard: {
    requestedEnabled: boolean;
    effectiveEnabled: boolean;
    port: number;
    baseUrl: string | null;
    disableReason: string | null;
  };
  checks: DoctorCheck[];
  nextActions?: string[];
}

const REQUIRED_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages,
] as const;

const OPTIONAL_INTENTS = [GatewayIntentBits.MessageContent] as const;

const TEXT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
] as const;

const VOICE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
] as const;

const INTENT_LABELS = new Map<number, string>([
  [GatewayIntentBits.Guilds, 'Guilds'],
  [GatewayIntentBits.GuildVoiceStates, 'GuildVoiceStates'],
  [GatewayIntentBits.GuildMessages, 'GuildMessages'],
  [GatewayIntentBits.MessageContent, 'MessageContent'],
]);

const PERMISSION_LABELS = new Map<bigint, string>([
  [PermissionFlagsBits.ViewChannel, 'ViewChannel'],
  [PermissionFlagsBits.SendMessages, 'SendMessages'],
  [PermissionFlagsBits.EmbedLinks, 'EmbedLinks'],
  [PermissionFlagsBits.Connect, 'Connect'],
  [PermissionFlagsBits.Speak, 'Speak'],
]);

export class DoctorService {
  private playbackSessionManager: PlaybackSessionManager | null = null;
  private music: MusicService | null = null;

  public constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaClient,
    private readonly ffmpeg: FfmpegStatus,
    private readonly expectedSlashCommands: number,
    private readonly guildSettings: GuildSettingsService,
    private readonly playbackSessions: PlaybackSessionsService,
    private readonly player: Player,
    private readonly operationalTelemetry: OperationalTelemetryService,
    private readonly operationalTelemetryStore: OperationalTelemetryStoreService,
  ) {}

  public attachPlaybackSessionManager(playbackSessionManager: PlaybackSessionManager) {
    this.playbackSessionManager = playbackSessionManager;
  }

  public attachMusicService(music: MusicService) {
    this.music = music;
  }

  public async run(input: DoctorRunInput): Promise<DoctorReport> {
    const appVersion = this.config.appVersion ?? APP_VERSION;
    const directVoiceChannel = input.member?.voice.channel ?? null;
    const voiceChannelId = input.voiceChannelId ?? input.member?.voice.channelId ?? input.member?.voice.channel?.id ?? null;
    const checks = await Promise.all([
      Promise.resolve(this.checkDiscordSession(input.client)),
      Promise.resolve(this.checkVoiceCryptoRuntime()),
      Promise.resolve(this.checkFfmpeg()),
      Promise.resolve(this.checkSpotify()),
      this.checkDatabase(),
      Promise.resolve(this.checkIntents(input.client)),
      this.checkSlashCommands(input.client, input.guild),
      Promise.resolve(this.checkDashboardRuntime()),
      Promise.resolve(this.checkPlaybackPipeline()),
      this.checkTextPermissions(input.guild, input.textChannelId ?? null),
      this.checkVoicePermissions(input.guild, directVoiceChannel, voiceChannelId),
      this.checkVoicePlaybackTarget(input.guild, input.guild.id, directVoiceChannel, voiceChannelId),
      Promise.resolve(this.checkPlayerState(input.guild.id)),
      this.checkOperationalTelemetry(input.guild.id),
      this.checkRuntimeWarnings(),
      this.checkPlaybackSession(input.guild.id),
    ]);

    const summary = summarizeChecks(checks);
    const slashScope = this.getSlashScope(input.guild.id);
    const dashboard = resolveDashboardConfig(this.config.dashboard);

    return {
      appVersion,
      overallStatus: resolveOverallStatus(summary),
      summary,
      slashScope,
      dashboard: {
        requestedEnabled: dashboard.requestedEnabled,
        effectiveEnabled: dashboard.effectiveEnabled,
        port: dashboard.port,
        baseUrl: dashboard.baseUrl,
        disableReason: dashboard.disableReason,
      },
      checks,
      nextActions: buildNextActions(checks, slashScope),
    };
  }

  private checkDiscordSession(client: Client): DoctorCheck {
    if (!client.isReady() || !client.user) {
      return {
        label: 'Discord session',
        status: 'error',
        detail: 'O cliente Discord ainda nao esta pronto.',
      };
    }

    const applicationId = client.application?.id;
    if (applicationId && applicationId !== this.config.discordClientId) {
      return {
        label: 'Discord session',
        status: 'warning',
        detail: `Cliente online como ${client.user.tag}, mas o application id atual (${applicationId}) difere do DISCORD_CLIENT_ID configurado.`,
      };
    }

    return {
      label: 'Discord session',
      status: 'ok',
      detail: `Cliente online como ${client.user.tag}. Ping atual: ${Math.round(client.ws.ping)}ms.`,
    };
  }

  private checkFfmpeg(): DoctorCheck {
    if (this.ffmpeg.available) {
      return {
        label: 'FFmpeg',
        status: 'ok',
        detail: `Executavel ativo em ${this.ffmpeg.executable}. ${this.ffmpeg.detail}`,
      };
    }

    return {
      label: 'FFmpeg',
      status: 'error',
      detail: `FFmpeg indisponivel em ${this.ffmpeg.executable}. ${this.ffmpeg.detail}`,
    };
  }

  private checkVoiceCryptoRuntime(): DoctorCheck {
    const status = getVoiceCryptoRuntimeStatus() ?? prepareVoiceCryptoRuntime();

    if (status.backend === 'unavailable') {
      return {
        label: 'Voice crypto',
        status: 'error',
        detail: status.detail,
      };
    }

    return {
      label: 'Voice crypto',
      status: 'ok',
      detail: status.detail,
    };
  }

  private checkSpotify(): DoctorCheck {
    if (this.config.spotify.enabled) {
      return {
        label: 'Spotify',
        status: 'ok',
        detail: 'Credenciais configuradas para resolver links do Spotify.',
      };
    }

    return {
      label: 'Spotify',
      status: 'warning',
      detail: 'Spotify desativado. Defina SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET para habilitar links.',
    };
  }

  private checkDashboardRuntime(): DoctorCheck {
    const dashboard = resolveDashboardConfig(this.config.dashboard);

    if (!dashboard.requestedEnabled) {
      return {
        label: 'Dashboard admin center',
        status: 'ok',
        detail: `Dashboard opt-in desativado por ambiente. Versao atual: v${this.config.appVersion ?? APP_VERSION}.`,
      };
    }

    if (!dashboard.effectiveEnabled) {
      return {
        label: 'Dashboard admin center',
        status: 'warning',
        detail: dashboard.disableReason ?? 'Dashboard solicitado, mas ainda nao ficou efetivo.',
      };
    }

    return {
      label: 'Dashboard admin center',
      status: 'ok',
      detail: `Dashboard ativo em ${dashboard.baseUrl ?? 'baseUrl ausente'} (porta ${dashboard.port}).`,
    };
  }

  private checkPlaybackPipeline(): DoctorCheck {
    const routes = this.music?.describePlaybackRoutes() ?? describeConfiguredPlaybackRoutes(this.config.spotify.enabled, this.config.youtube);
    return {
      label: 'Playback pipeline',
      status: routes.youtube.requestedProfile === 'fidelity' && routes.youtube.effectiveProfile !== 'fidelity' ? 'warning' : 'ok',
      detail: [
        `YouTube: perfil solicitado **${routes.youtube.requestedProfile}**, efetivo **${routes.youtube.effectiveProfile}**. Pipeline real em **${routes.youtube.pipeline}**, client **${routes.youtube.client}**, route **${formatRouteKind(
          routes.youtube.routeKind,
        )}**, highWaterMark **${formatHighWaterMark(routes.youtube.highWaterMark)}**, cookie **${routes.youtube.cookieConfigured ? 'configurado' : 'ausente'}**, poToken **${routes.youtube.generateWithPoToken ? 'ativo' : 'inativo'}**, disablePlayer=${String(routes.youtube.disablePlayer)}.`,
        routes.spotify.enabled
          ? `Spotify: o PHONIX aceita links e metadados, mas o playback nao sai do source original; hoje eles entram por **${routes.spotify.pipeline}** com route **${formatRouteKind(routes.spotify.routeKind)}**.`
          : 'Spotify: desativado, entao nao ha bridge ativa para links do Spotify.',
        routes.youtube.overrideBridgeMode ? `Bridge preferida do extractor: **${routes.youtube.overrideBridgeMode}**.` : null,
        routes.youtube.downgradeReason,
      ].join(' '),
    };
  }

  private async checkDatabase(): Promise<DoctorCheck> {
    try {
      await this.prisma.guildSettings.count();
      await this.prisma.guildPlaybackSession.count();

      return {
        label: 'Database',
        status: 'ok',
        detail: `Consulta basica concluida com sucesso em ${this.config.databaseUrl}.`,
      };
    } catch (error) {
      return {
        label: 'Database',
        status: 'error',
        detail: `Falha ao acessar o banco: ${formatErrorMessage(error)}.`,
      };
    }
  }

  private checkIntents(client: Client): DoctorCheck {
    const intents = new IntentsBitField(client.options.intents);
    const missingRequired = REQUIRED_INTENTS.filter((intent) => !intents.has(intent));
    const missingOptional = OPTIONAL_INTENTS.filter((intent) => !intents.has(intent));

    if (missingRequired.length > 0) {
      return {
        label: 'Gateway intents',
        status: 'error',
        detail: `Intents obrigatorias ausentes: ${formatIntentNames(missingRequired)}.`,
      };
    }

    if (missingOptional.length > 0) {
      return {
        label: 'Gateway intents',
        status: 'warning',
        detail: `Intents obrigatorias ativas. Falta ${formatIntentNames(missingOptional)}, entao o prefixo ! pode ficar limitado fora de slash commands.`,
      };
    }

    return {
      label: 'Gateway intents',
      status: 'ok',
      detail: `Intents ativas: ${formatIntentNames([...REQUIRED_INTENTS, ...OPTIONAL_INTENTS])}.`,
    };
  }

  private async checkSlashCommands(client: Client, guild: Guild): Promise<DoctorCheck> {
    const scope = this.getSlashScope(guild.id);

    if (scope === 'mismatch') {
      return {
        label: 'Slash commands',
        status: 'warning',
        detail: `O deploy local esta apontando para a guild ${this.config.discordGuildId}, mas o diagnostico rodou em ${guild.id}.`,
      };
    }

    try {
      const commands =
        scope === 'guild'
          ? await guild.commands.fetch()
          : await client.application?.commands.fetch();

      if (!commands) {
        return {
          label: 'Slash commands',
          status: 'warning',
          detail: 'Nao foi possivel acessar a aplicacao para verificar slash commands.',
        };
      }

      const currentCount = commands.size;
      if (currentCount !== this.expectedSlashCommands) {
        return {
          label: 'Slash commands',
          status: 'warning',
          detail: `Escopo ${scope}. Esperado ${this.expectedSlashCommands} comandos e encontrei ${currentCount}. Rode npm run deploy:commands se necessario.`,
        };
      }

      return {
        label: 'Slash commands',
        status: 'ok',
        detail: `Escopo ${scope}. ${currentCount} comandos publicados e alinhados com o registry atual.`,
      };
    } catch (error) {
      return {
        label: 'Slash commands',
        status: 'warning',
        detail: `Nao foi possivel consultar os slash commands: ${formatErrorMessage(error)}.`,
      };
    }
  }

  private async checkTextPermissions(guild: Guild, textChannelId: string | null): Promise<DoctorCheck> {
    const me = await this.resolveBotMember(guild);
    if (!me) {
      return {
        label: 'Text channel permissions',
        status: 'error',
        detail: 'Nao consegui resolver o membro do bot nesta guild.',
      };
    }

    if (!textChannelId) {
      return {
        label: 'Text channel permissions',
        status: 'warning',
        detail: 'Nenhum canal de texto alvo foi identificado para validar envio de mensagens e embeds.',
      };
    }

    const channel = guild.channels.cache.get(textChannelId) ?? (await guild.channels.fetch(textChannelId).catch(() => null));
    if (!channel || !('isTextBased' in channel) || !channel.isTextBased()) {
      return {
        label: 'Text channel permissions',
        status: 'warning',
        detail: 'O canal atual nao esta disponivel para validar envio de mensagens e embeds.',
      };
    }

    const permissions = me.permissionsIn(channel);
    const missing = TEXT_PERMISSIONS.filter((permission) => !permissions.has(permission));

    if (missing.length > 0) {
      return {
        label: 'Text channel permissions',
        status: 'error',
        detail: `Faltam permissoes no canal atual: ${formatPermissionNames(missing)}.`,
      };
    }

    return {
      label: 'Text channel permissions',
      status: 'ok',
      detail: `Permissoes de texto validas em #${'name' in channel ? channel.name : textChannelId}.`,
    };
  }

  private async checkVoicePermissions(
    guild: Guild,
    directVoiceChannel: VoiceBasedChannel | null,
    voiceChannelId: Snowflake | null,
  ): Promise<DoctorCheck> {
    const me = await this.resolveBotMember(guild);
    if (!me) {
      return {
        label: 'Voice channel permissions',
        status: 'error',
        detail: 'Nao consegui resolver o membro do bot para validar o canal de voz.',
      };
    }

    if (!voiceChannelId) {
      return {
        label: 'Voice channel permissions',
        status: 'warning',
        detail: 'Nenhum canal de voz alvo foi identificado. O check de voz foi pulado.',
      };
    }

    const voiceChannel = directVoiceChannel ?? (await resolveVoiceChannelById(guild, voiceChannelId));
    if (!voiceChannel) {
      return {
        label: 'Voice channel permissions',
        status: 'warning',
        detail: 'O canal de voz alvo nao esta disponivel para validar as permissoes do bot.',
      };
    }

    const permissions = me.permissionsIn(voiceChannel);
    const missing = VOICE_PERMISSIONS.filter((permission) => !permissions.has(permission));

    if (missing.length > 0) {
      return {
        label: 'Voice channel permissions',
        status: 'error',
        detail: `Faltam permissoes em ${voiceChannel.name}: ${formatPermissionNames(missing)}.`,
      };
    }

    return {
      label: 'Voice channel permissions',
      status: 'ok',
      detail: `Permissoes de voz validas em ${voiceChannel.name}.`,
    };
  }

  private async checkVoicePlaybackTarget(
    guild: Guild,
    guildId: string,
    directVoiceChannel: VoiceBasedChannel | null,
    voiceChannelId: Snowflake | null,
  ): Promise<DoctorCheck> {
    const queue = this.player.nodes.get(guildId);
    const voiceChannel = queue?.channel ?? directVoiceChannel ?? (voiceChannelId ? await resolveVoiceChannelById(guild, voiceChannelId) : null);

    if (!voiceChannel) {
      return {
        label: 'Voice playback target',
        status: 'warning',
        detail: 'Nenhum canal de voz alvo foi detectado. Entre em call ou inicie uma fila para validar bitrate e teto real de qualidade.',
      };
    }

    return {
      label: 'Voice playback target',
      status: 'ok',
      detail: `Canal alvo: ${voiceChannel.name}. Bitrate atual: **${formatBitrateKbps(voiceChannel.bitrate)}**. Esse valor define o teto de qualidade do Discord para a sessao atual.`,
    };
  }

  private checkPlayerState(guildId: string): DoctorCheck {
    const queue = this.player.nodes.get(guildId);
    if (!queue || !hasMeaningfulQueueState(queue)) {
      return {
        label: 'Player state',
        status: 'ok',
        detail: 'Nenhuma fila ativa nesta guild no momento.',
      };
    }

    const voiceStatus = queue.dispatcher?.voiceConnection?.state.status ?? 'desconhecido';
    const currentTrack = queue.currentTrack?.title ?? 'nenhuma';
    const queuedTracks = queue.size;

    if (queue.channel && ['disconnected', 'destroyed'].includes(String(voiceStatus))) {
      return {
        label: 'Player state',
        status: 'warning',
        detail: `Fila ativa em ${queue.channel.name}, mas a conexao de voz esta em ${voiceStatus}. Track atual: ${currentTrack}. Fila: ${queuedTracks}.`,
      };
    }

    return {
      label: 'Player state',
      status: 'ok',
      detail: queue.channel
        ? `Fila ativa em ${queue.channel.name}. Voice=${voiceStatus}. Track atual: ${currentTrack}. Proximas faixas: ${queuedTracks}.`
        : `Fila ativa sem canal associado. Voice=${voiceStatus}. Track atual: ${currentTrack}.`,
    };
  }

  private async checkOperationalTelemetry(guildId: string): Promise<DoctorCheck> {
    const snapshot = await this.operationalTelemetry.getGuildSnapshotWithHistory(guildId);
    const topFailure = Object.entries(snapshot.failures.byCode).sort((left, right) => right[1] - left[1])[0] ?? null;
    const lastRecovery = snapshot.recoveries.last;
    const activeRecovery = snapshot.recoveries.active;
    const recentTerminalFailure = snapshot.recentIncidents.find((incident) => incident.category === 'failure' && incident.terminal);
    const lastPlayRoute =
      snapshot.recentIncidents.find((incident) => incident.category === 'playback' && incident.type === 'play_request' && incident.pipeline) ?? null;

    if (activeRecovery) {
      return {
        label: 'Operational telemetry',
        status: 'warning',
        detail: `Recovery em andamento via ${activeRecovery.trigger}, tentativa ${activeRecovery.attempt}. Falhas acumuladas: ${snapshot.failures.total}.`,
      };
    }

    if (snapshot.failures.total === 0 && snapshot.commands.failed === 0) {
      return {
        label: 'Operational telemetry',
        status: 'ok',
        detail: 'Nenhuma falha operacional registrada nesta execucao para a guild.',
      };
    }

    const detail = [
      `Falhas: ${snapshot.failures.total}`,
      topFailure ? `top code=${topFailure[0]} (${topFailure[1]})` : 'sem top code',
      `recoveries ok=${snapshot.recoveries.succeeded}`,
      `recoveries failed=${snapshot.recoveries.failed}`,
      snapshot.playbackSignals.session_restored ? `sessao restaurada=${snapshot.playbackSignals.session_restored}` : null,
      snapshot.playbackSignals.session_partial ? `sessao parcial=${snapshot.playbackSignals.session_partial}` : null,
      snapshot.playbackSignals.session_broken ? `sessao quebrada=${snapshot.playbackSignals.session_broken}` : null,
      snapshot.playbackSignals.session_pending ? `sessao pendente=${snapshot.playbackSignals.session_pending}` : null,
      snapshot.recoveries.averageDurationMs !== null ? `avg recovery=${snapshot.recoveries.averageDurationMs}ms` : null,
      lastRecovery ? `ultimo recovery=${lastRecovery.type}` : null,
      lastPlayRoute ? `ultima rota=${lastPlayRoute.provider ?? 'unknown'}/${lastPlayRoute.pipeline}` : null,
    ]
      .filter(Boolean)
      .join('. ');

    return {
      label: 'Operational telemetry',
      status: recentTerminalFailure ? 'error' : 'warning',
      detail,
    };
  }

  private async checkRuntimeWarnings(): Promise<DoctorCheck> {
    const warnings = await this.operationalTelemetryStore.getRuntimeWarningSnapshot(3);

    if (warnings.total === 0) {
      return {
        label: 'Runtime warnings',
        status: 'ok',
        detail: 'Nenhum warning upstream persistido nesta instalacao.',
      };
    }

    const recent = warnings.recent.map((warning) => warning.code ?? warning.type).join(', ');
    return {
      label: 'Runtime warnings',
      status: 'warning',
      detail: `${warnings.total} warning(s) upstream persistido(s). Mais recentes: ${recent}.`,
    };
  }

  private async checkPlaybackSession(guildId: string): Promise<DoctorCheck> {
    const [autoResumeEnabled, persistedSession, diagnostics] = await Promise.all([
      this.guildSettings.isResumeQueueEnabled(guildId),
      this.playbackSessions.get(guildId),
      this.playbackSessionManager?.getDiagnostics(guildId) ?? Promise.resolve(null),
    ]);

    if (!autoResumeEnabled) {
      return {
        label: 'Playback session',
        status: 'warning',
        detail: diagnostics
          ? `Resume queue desativado. Saude da sessao: ${formatSessionHealth(diagnostics.health)}. ${diagnostics.healthDetail}`
          : persistedSession
            ? `Resume queue desativado com ${persistedSession.items.length + Number(Boolean(persistedSession.currentTrack))} faixa(s) ainda salvas.`
            : 'Resume queue desativado e sem sessao persistida pendente.',
      };
    }

    if (!diagnostics) {
      if (!persistedSession) {
        return {
          label: 'Playback session',
          status: 'ok',
          detail: 'Resume queue ativo. Nenhuma sessao pendente ou ativa precisa ser recuperada.',
        };
      }

      return {
        label: 'Playback session',
        status: 'warning',
        detail: `Sessao persistida detectada com ${persistedSession.items.length + Number(Boolean(persistedSession.currentTrack))} faixa(s), mas o diagnostico detalhado de sessao nao esta anexado ao runtime atual.`,
      };
    }

    const status =
      diagnostics.health === 'broken'
        ? 'error'
        : diagnostics.health === 'healthy' && diagnostics.state !== 'pending'
          ? 'ok'
          : 'warning';
    return {
      label: 'Playback session',
      status,
      detail: [
        `Saude ${formatSessionHealth(diagnostics.health)}. Estado ${diagnostics.state}.`,
        diagnostics.hasPersistedSession
          ? `Persistida: ${diagnostics.itemCount} faixa(s), atualizada em ${formatDiagnosticMoment(diagnostics.updatedAt)}.`
          : 'Sem sessao persistida pendente.',
        diagnostics.hasActiveQueue ? `Fila ao vivo: ${diagnostics.liveItemCount} faixa(s) rastreadas.` : 'Sem fila ao vivo no momento.',
        `Pronta para recover: ${formatEnabled(diagnostics.recoveryReady)}.`,
        `Ultimo recovery: ${formatRecoveryStatus(diagnostics.lastRecoveryStatus)}.`,
        diagnostics.lastRecoveryRecoveredTrackCount > 0 || diagnostics.lastRecoverySkippedTrackCount > 0
          ? `Ultimo resultado: ${diagnostics.lastRecoveryRecoveredTrackCount} restaurada(s), ${diagnostics.lastRecoverySkippedTrackCount} pulada(s).`
          : null,
        diagnostics.healthDetail,
        diagnostics.lastAutoRecoverBlockReason ? `Bloqueio recente: ${diagnostics.lastAutoRecoverBlockReason}.` : null,
        diagnostics.manualInterventionRequired ? 'Intervencao manual recomendada antes do proximo recover.' : null,
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  private getSlashScope(currentGuildId: string): DoctorReport['slashScope'] {
    if (!this.config.discordGuildId) {
      return 'global';
    }

    return this.config.discordGuildId === currentGuildId ? 'guild' : 'mismatch';
  }

  private async resolveBotMember(guild: Guild) {
    return guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  }
}

function summarizeChecks(checks: DoctorCheck[]): DoctorReportSummary {
  return checks.reduce<DoctorReportSummary>(
    (summary, check) => {
      summary[check.status] += 1;
      return summary;
    },
    {
      ok: 0,
      warning: 0,
      error: 0,
    },
  );
}

function resolveOverallStatus(summary: DoctorReportSummary): DoctorStatus {
  if (summary.error > 0) {
    return 'error';
  }

  if (summary.warning > 0) {
    return 'warning';
  }

  return 'ok';
}

function formatIntentNames(intents: readonly number[]) {
  return intents.map((intent) => INTENT_LABELS.get(intent) ?? String(intent)).join(', ');
}

function formatPermissionNames(permissions: readonly bigint[]) {
  return permissions.map((permission) => PERMISSION_LABELS.get(permission) ?? String(permission)).join(', ');
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'erro desconhecido';
}

function buildNextActions(checks: DoctorCheck[], slashScope: DoctorReport['slashScope']) {
  const actions = new Set<string>();

  for (const check of checks) {
    if (check.label === 'FFmpeg' && check.status === 'error') {
      actions.add('Instale o FFmpeg ou defina `FFMPEG_PATH` antes de usar playback e recovery.');
    }

    if (check.label === 'Slash commands' && check.status !== 'ok') {
      actions.add(
        slashScope === 'mismatch'
          ? 'Confira `DISCORD_GUILD_ID` ou use deploy global para evitar mismatch de slash commands.'
          : 'Rode `npm run deploy:commands` para alinhar os slash commands publicados com o registry atual.',
      );
    }

    if (check.label === 'Text channel permissions' && check.status === 'error') {
      actions.add('Conceda `ViewChannel`, `SendMessages` e `EmbedLinks` ao PHONIX no canal de texto atual.');
    }

    if (check.label === 'Voice channel permissions' && check.status === 'error') {
      actions.add('Conceda `ViewChannel`, `Connect` e `Speak` ao PHONIX no canal de voz que sera usado.');
    }

    if (check.label === 'Voice playback target' && check.status === 'warning') {
      actions.add('Entre em um canal de voz antes de rodar `/doctor` se quiser validar bitrate e teto real de qualidade do playback.');
    }

    if (check.label === 'Playback pipeline' && check.status === 'warning') {
      actions.add(
        check.detail.includes('Runtime degradado para compatibility')
          ? 'O runtime degradou para `compatibility` depois de falha real em `youtubei`. Compare `compatibility` vs `fidelity` no mesmo link para confirmar se o bloqueio esta no pipeline nativo atual.'
          : 'Se quiser usar o perfil `fidelity`, configure `YOUTUBE_COOKIE` valido; sem isso o PHONIX mantem `compatibility` por seguranca.',
      );
    }

    if (check.label === 'Dashboard admin center' && check.status === 'warning') {
      actions.add('Revise `DASHBOARD_BASE_URL`, `DASHBOARD_SESSION_SECRET` e `DISCORD_CLIENT_SECRET` para ativar o Admin Center sem quebrar o runtime padrao.');
    }

    if (check.label === 'Spotify' && check.status === 'warning') {
      actions.add('Configure `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` se quiser aceitar links do Spotify.');
    }

    if (check.label === 'Database' && check.status === 'error') {
      actions.add('Revise `DATABASE_URL` e confirme que o processo pode ler e gravar o arquivo SQLite.');
    }

    if (check.label === 'Playback session' && check.status !== 'ok') {
      actions.add(
        check.status === 'error'
          ? 'Use `/recover` somente se a sessao ainda estiver aproveitavel; se ela continuar quebrada, revise `/config resumequeue` para limpar e recriar uma sessao saudavel.'
          : 'Use `/queue`, `/nowplaying` e `/recover` para revisar a sessao atual e confirmar o que ainda pode ser retomado.',
      );
    }

    if (check.label === 'Operational telemetry' && check.status !== 'ok') {
      actions.add('Reproduza a falha, rode `/doctor` novamente e use os codigos de falha para isolar permissao, stream ou recovery.');
    }
  }

  return [...actions].slice(0, 5);
}

function formatBitrateKbps(bitrate: number) {
  const kbps = bitrate / 1000;
  return Number.isInteger(kbps) ? `${kbps} kbps` : `${kbps.toFixed(1)} kbps`;
}

function formatSessionHealth(health: 'healthy' | 'recoverable' | 'partial' | 'broken' | 'disabled') {
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

function hasMeaningfulQueueState(
  queue: {
    currentTrack?: unknown;
    size?: number;
    isPlaying?: () => boolean;
  } | null,
) {
  if (!queue) {
    return false;
  }

  return Boolean(queue.currentTrack) || (queue.size ?? 0) > 0 || queue.isPlaying?.() === true;
}

function formatHighWaterMark(value: number | null) {
  if (!value) {
    return 'padrao do extractor';
  }

  return `${value} bytes`;
}

function formatRouteKind(routeKind: 'native' | 'bridge' | 'unknown') {
  if (routeKind === 'native') {
    return 'nativa';
  }

  if (routeKind === 'bridge') {
    return 'bridge';
  }

  return 'desconhecida';
}

function formatDiagnosticMoment(value: Date | null) {
  return value ? value.toISOString() : 'ainda nao registrada';
}

function formatRecoveryStatus(status: 'idle' | 'running' | 'success' | 'failed' | 'aborted' | null) {
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

async function resolveVoiceChannelById(guild: Guild, channelId: Snowflake): Promise<VoiceBasedChannel | null> {
  const cached = guild.channels.cache.get(channelId);
  const channel =
    cached ??
    ('fetch' in guild.channels && typeof guild.channels.fetch === 'function'
      ? await guild.channels.fetch(channelId).catch(() => null)
      : null);
  if (!channel || !('isVoiceBased' in channel) || !channel.isVoiceBased()) {
    return null;
  }

  return channel;
}
