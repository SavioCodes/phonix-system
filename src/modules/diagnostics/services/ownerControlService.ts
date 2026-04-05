import type { PrismaClient } from '@prisma/client';
import type { Player } from 'discord-player';
import type { Client } from 'discord.js';
import { logger } from '../../../core/logging/logger.js';
import { resolveDashboardConfig, type AppConfig } from '../../../core/config/env.js';
import { APP_VERSION } from '../../../core/config/version.js';
import {
  PHONIX_OFFICIAL_GUILD_ID,
  PHONIX_OWNER_USER_ID,
  isOfficialGuildId,
  isOwnerUserId,
} from '../../../core/security/ownerAccess.js';
import type { GuildSettingsService } from '../../library/services/guildSettingsService.js';
import type { PlaybackSessionsService } from '../../library/services/playbackSessionsService.js';
import type { PlaybackSessionManager } from '../../music/playbackSessionManager.js';
import type { FfmpegStatus } from '../../music/ffmpeg.js';
import { describeConfiguredPlaybackRoutes, type MusicService } from '../../music/musicService.js';
import type { NoticeView } from '../../ui/view-models.js';
import type { OperationalIncident } from './operationalTelemetryService.js';
import type { OperationalTelemetryService } from './operationalTelemetryService.js';
import type { OperationalTelemetryStoreService } from './operationalTelemetryStoreService.js';
import { embeds } from '../../ui/embeds.js';

type OwnerCheckStatus = 'ok' | 'warning' | 'error';

interface OwnerCheck {
  label: string;
  status: OwnerCheckStatus;
  detail: string;
}

interface OwnerOfficialGuildStatus {
  id: string;
  present: boolean;
  name: string | null;
  memberCount: number | null;
  settingsSummary: string | null;
  sessionSummary: string | null;
  detail: string;
  status: OwnerCheckStatus;
}

interface OwnerRuntimeReport {
  generatedAt: Date;
  processStartedAt: Date;
  appVersion: string;
  botTag: string;
  pingMs: number;
  guildCount: number;
  nodeVersion: string;
  runtimeLabel: string;
  officialGuild: OwnerOfficialGuildStatus;
  checks: OwnerCheck[];
  criticalIssues: string[];
  runtimeWarningCount: number;
  recentIncidentCount: number;
  liveFailureCount: number;
  activeRecoveryCount: number;
}

export interface OwnerNotificationResult {
  delivered: boolean;
  skipped: boolean;
  reason: string | null;
  report: OwnerRuntimeReport;
}

interface OwnerControlServiceDeps {
  config: AppConfig;
  prisma: PrismaClient;
  ffmpeg: FfmpegStatus;
  expectedSlashCommands: number;
  player: Player;
  operationalTelemetry: OperationalTelemetryService;
  operationalTelemetryStore: OperationalTelemetryStoreService;
  guildSettings: GuildSettingsService;
  playbackSessions: PlaybackSessionsService;
}

export class OwnerControlService {
  private playbackSessionManager: PlaybackSessionManager | null = null;
  private music: MusicService | null = null;
  private startupOnlineNotificationAttempted = false;

  public constructor(private readonly deps: OwnerControlServiceDeps) {}

  public attachPlaybackSessionManager(playbackSessionManager: PlaybackSessionManager) {
    this.playbackSessionManager = playbackSessionManager;
  }

  public attachMusicService(music: MusicService) {
    this.music = music;
  }

  public isOwnerUserId(userId: string | null | undefined) {
    return isOwnerUserId(userId);
  }

  public async sendStartupOnlineNotification(
    client: Client,
    input: {
      startupIssue?: string | null;
    } = {},
  ): Promise<OwnerNotificationResult> {
    if (this.startupOnlineNotificationAttempted) {
      return {
        delivered: false,
        skipped: true,
        reason: 'startup_online_notification_already_attempted',
        report: await this.buildRuntimeReport(client, input),
      };
    }

    this.startupOnlineNotificationAttempted = true;
    return this.sendOwnerDm(client, {
      trigger: 'startup',
      startupIssue: input.startupIssue ?? null,
    });
  }

  public async sendOwnerNotificationTest(client: Client): Promise<OwnerNotificationResult> {
    return this.sendOwnerDm(client, {
      trigger: 'notify-test',
      startupIssue: null,
    });
  }

  public async createStatusNotice(client: Client): Promise<NoticeView> {
    const report = await this.buildRuntimeReport(client);

    return {
      kind: 'notice',
      variant: report.criticalIssues.length > 0 ? 'warning' : 'info',
      title: 'PHONIX | Owner status',
      description:
        report.criticalIssues.length > 0
          ? 'Resumo global do runtime com alertas que merecem sua atencao.'
          : 'Resumo global do runtime. Nenhum alerta critico foi detectado nesta leitura.',
      fields: [
        {
          name: 'Resumo rapido',
          value: [
            `Bot: **${report.botTag}**`,
            `Versao: **v${report.appVersion}**`,
            `Online desde: **${report.processStartedAt.toISOString()}**`,
            `Ping: **${report.pingMs}ms**`,
            `Guilds conectadas: **${report.guildCount}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Servidor oficial',
          value: [
            `Guild oficial: **${report.officialGuild.present ? 'presente' : 'ausente'}**`,
            `Nome: **${report.officialGuild.name ?? 'nao resolvido'}**`,
            `Referencia: **${report.officialGuild.id}**`,
            report.officialGuild.settingsSummary ?? 'Defaults da guild oficial ainda nao puderam ser lidos.',
            report.officialGuild.sessionSummary ?? 'Sessao da guild oficial ainda nao foi inspecionada.',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Runtime',
          value: [
            `Node: **${report.nodeVersion}**`,
            `Ambiente: **${report.runtimeLabel}**`,
            ...report.checks
              .filter((check) => ['Database', 'FFmpeg', 'Slash commands', 'Playback pipeline'].includes(check.label))
              .map((check) => `${check.label}: **${formatCheckStatus(check.status)}** - ${check.detail}`),
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Observabilidade',
          value: [
            `Falhas nesta execucao: **${report.liveFailureCount}**`,
            `Recoveries ativos: **${report.activeRecoveryCount}**`,
            `Warnings persistidos: **${report.runtimeWarningCount}**`,
            `Incidentes recentes persistidos: **${report.recentIncidentCount}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Saude inicial',
          value:
            report.criticalIssues.length > 0
              ? report.criticalIssues.map((issue) => `- ${issue}`).join('\n')
              : 'Nenhum problema critico foi detectado no boot atual.',
          inline: false,
        },
      ],
      hint: 'Use `/owner official-guild`, `/owner incidents` e `/owner guilds` para abrir visoes mais focadas do runtime.',
    };
  }

  public async createOfficialGuildNotice(client: Client): Promise<NoticeView> {
    const officialGuild = await this.resolveOfficialGuildStatus(client);

    return {
      kind: 'notice',
      variant: officialGuild.present ? 'info' : 'warning',
      title: 'PHONIX | Official guild',
      description: officialGuild.detail,
      fields: [
        {
          name: 'Referencia oficial',
          value: [
            `Guild ID: **${officialGuild.id}**`,
            `Presenca do bot: **${officialGuild.present ? 'sim' : 'nao'}**`,
            `Nome resolvido: **${officialGuild.name ?? 'nao resolvido'}**`,
            `Member count: **${officialGuild.memberCount ?? 'indisponivel'}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Configuracao da guild oficial',
          value: officialGuild.settingsSummary ?? 'Nao foi possivel ler os defaults desta guild no momento.',
          inline: false,
        },
        {
          name: 'Sessao e recovery',
          value: officialGuild.sessionSummary ?? 'Nenhum estado de sessao relevante foi detectado para a guild oficial.',
          inline: false,
        },
      ],
      hint: officialGuild.present
        ? 'Se quiser aprofundar uma guild especifica, rode `/doctor` ou `!doctor` dentro dela.'
        : 'Se o bot deveria estar no servidor oficial, confirme o invite e a presenca da aplicacao nesta guild.',
    };
  }

  public createGuildsNotice(client: Client): NoticeView {
    const guilds = [...client.guilds.cache.values()]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((guild) => ({
        id: guild.id,
        name: guild.name,
        memberCount: guild.memberCount ?? null,
        official: isOfficialGuildId(guild.id),
      }));

    const visibleGuilds = guilds.slice(0, 10);
    const hiddenCount = Math.max(guilds.length - visibleGuilds.length, 0);

    return {
      kind: 'notice',
      variant: 'info',
      title: 'PHONIX | Owner guilds',
      description: 'Guilds atualmente conectadas a esta execucao do bot.',
      fields: [
        {
          name: 'Panorama',
          value: [
            `Total de guilds: **${guilds.length}**`,
            `Guild oficial presente: **${guilds.some((guild) => guild.official) ? 'sim' : 'nao'}**`,
            `Owner de referencia: **${PHONIX_OWNER_USER_ID}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Guilds visiveis agora',
          value:
            visibleGuilds.length > 0
              ? [
                  ...visibleGuilds.map((guild, index) =>
                    `${index + 1}. **${guild.name}** (${guild.id})${guild.official ? ' [OFICIAL]' : ''}${
                      guild.memberCount !== null ? ` - membros: ${guild.memberCount}` : ''
                    }`,
                  ),
                  hiddenCount > 0 ? `...e mais **${hiddenCount}** guild(s) fora desta lista resumida.` : null,
                ]
                  .filter(Boolean)
                  .join('\n')
              : 'Nenhuma guild conectada neste momento.',
          inline: false,
        },
      ],
      hint: 'Use `/owner official-guild` para revisar a guild oficial com mais detalhe.',
    };
  }

  public async createIncidentsNotice(client: Client): Promise<NoticeView> {
    const incidents = await this.deps.operationalTelemetryStore.getRecentIncidents(8);
    const relevantIncidents = incidents.filter((incident) =>
      ['failure', 'recovery', 'runtime_warning'].includes(incident.category),
    );
    const runtimeWarnings = await this.deps.operationalTelemetryStore.getRuntimeWarningSnapshot(3);

    return {
      kind: 'notice',
      variant: relevantIncidents.some((incident) => incident.category === 'failure' && incident.terminal) ? 'warning' : 'info',
      title: 'PHONIX | Owner incidents',
      description:
        relevantIncidents.length > 0
          ? 'Ultimos incidentes persistidos que ajudam a entender a saude operacional recente do bot.'
          : 'Nenhum incidente persistido relevante foi encontrado nesta leitura.',
      fields: [
        {
          name: 'Resumo',
          value: [
            `Incidentes relevantes lidos: **${relevantIncidents.length}**`,
            `Warnings persistidos: **${runtimeWarnings.total}**`,
            `Guild oficial presente agora: **${client.guilds.cache.has(PHONIX_OFFICIAL_GUILD_ID) ? 'sim' : 'nao'}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Mais recentes',
          value:
            relevantIncidents.length > 0
              ? relevantIncidents.map((incident) => formatIncidentLine(client, incident)).join('\n')
              : 'Nenhuma falha, recovery ou warning persistido para mostrar agora.',
          inline: false,
        },
      ],
      hint: 'Cruze estes incidentes com `/owner status` e com `/doctor` dentro da guild afetada para aprofundar a causa.',
    };
  }

  public async createNotifyTestNotice(client: Client): Promise<NoticeView> {
    const notification = await this.sendOwnerNotificationTest(client);

    return {
      kind: 'notice',
      variant: notification.delivered ? 'success' : 'warning',
      title: 'PHONIX | Owner notify test',
      description: notification.delivered
        ? 'A DM de teste foi enviada para o owner com o resumo operacional atual.'
        : 'A DM de teste nao foi entregue ao owner. Revise o motivo abaixo e confira os logs.',
      fields: [
        {
          name: 'Resultado',
          value: [
            `Entrega: **${notification.delivered ? 'ok' : 'falhou'}**`,
            `Owner ID: **${PHONIX_OWNER_USER_ID}**`,
            `Motivo: **${notification.reason ?? 'nenhum'}**`,
          ].join('\n'),
          inline: false,
        },
      ],
      hint: notification.delivered ? 'Abra o privado do owner para validar o embed de online.' : 'Se o owner bloquear DMs ou o Discord recusar a entrega, o PHONIX registra o warning no runtime.',
    };
  }

  private async sendOwnerDm(
    client: Client,
    input: {
      trigger: 'startup' | 'notify-test';
      startupIssue: string | null;
    },
  ): Promise<OwnerNotificationResult> {
    const report = await this.buildRuntimeReport(client, {
      startupIssue: input.startupIssue,
    });

    try {
      const ownerUser = await client.users.fetch(PHONIX_OWNER_USER_ID);
      await ownerUser.send({
        embeds: [this.buildStartupEmbed(report, input.trigger)],
      });

      return {
        delivered: true,
        skipped: false,
        reason: null,
        report,
      };
    } catch (error) {
      const reason = formatErrorMessage(error);
      logger.warn(
        {
          ownerUserId: PHONIX_OWNER_USER_ID,
          trigger: input.trigger,
          err: error,
        },
        'Owner DM delivery failed',
      );
      this.deps.operationalTelemetry.recordRuntimeWarning({
        code: 'OWNER_DM_FAILED',
        name: 'OwnerNotificationWarning',
        message: `Falha ao entregar DM operacional ao owner: ${reason}`,
        detail: `trigger=${input.trigger}`,
      });

      return {
        delivered: false,
        skipped: false,
        reason,
        report,
      };
    }
  }

  private async buildRuntimeReport(
    client: Client,
    input: {
      startupIssue?: string | null;
    } = {},
  ): Promise<OwnerRuntimeReport> {
    const runtimeWarnings = await this.deps.operationalTelemetryStore.getRuntimeWarningSnapshot(3);
    const recentIncidents = await this.deps.operationalTelemetryStore.getRecentIncidents(8);
    const checks = await Promise.all([
      this.checkDatabase(),
      Promise.resolve(this.checkFfmpeg()),
      this.checkSlashCommands(client),
      Promise.resolve(this.checkPlaybackPipeline()),
      Promise.resolve(this.checkObservability(client, runtimeWarnings.total, recentIncidents.length)),
      Promise.resolve(this.checkDashboardRuntime()),
    ]);
    const officialGuild = await this.resolveOfficialGuildStatus(client);
    const liveTelemetrySummary = this.buildLiveTelemetrySummary(client);
    const criticalIssues = [
      ...(input.startupIssue ? [`Falha durante o recovery de startup: ${input.startupIssue}.`] : []),
      ...checks.filter((check) => check.status === 'error').map((check) => `${check.label}: ${check.detail}`),
      ...(!officialGuild.present ? [officialGuild.detail] : []),
    ].slice(0, 5);

    return {
      generatedAt: new Date(),
      processStartedAt: new Date(Date.now() - process.uptime() * 1000),
      appVersion: this.deps.config.appVersion ?? APP_VERSION,
      botTag: client.user?.tag ?? 'PHONIX',
      pingMs: Math.max(0, Math.round(client.ws.ping)),
      guildCount: client.guilds.cache.size,
      nodeVersion: process.version,
      runtimeLabel: `${process.platform}/${process.arch} | pid ${process.pid}`,
      officialGuild,
      checks,
      criticalIssues,
      runtimeWarningCount: runtimeWarnings.total,
      recentIncidentCount: recentIncidents.length,
      liveFailureCount: liveTelemetrySummary.failureCount,
      activeRecoveryCount: liveTelemetrySummary.activeRecoveryCount,
    };
  }

  private buildStartupEmbed(report: OwnerRuntimeReport, trigger: 'startup' | 'notify-test') {
    const title = trigger === 'startup' ? 'PHONIX | Online' : 'PHONIX | Owner notify test';
    const description =
      trigger === 'startup'
        ? 'O bot ficou online e este resumo foi enviado automaticamente para o owner.'
        : 'Resumo operacional disparado manualmente pelo owner para validar a notificacao privada.';

    return embeds.notice({
      kind: 'notice',
      variant: report.criticalIssues.length > 0 ? 'warning' : 'success',
      title,
      description,
      fields: [
        {
          name: 'Resumo rapido',
          value: [
            `Bot: **${report.botTag}**`,
            `Versao: **v${report.appVersion}**`,
            `Horario do online: **${report.generatedAt.toISOString()}**`,
            `Ping: **${report.pingMs}ms**`,
            `Guilds: **${report.guildCount}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Servidor oficial',
          value: [
            `Referencia: **${report.officialGuild.id}**`,
            `Presente: **${report.officialGuild.present ? 'sim' : 'nao'}**`,
            `Nome: **${report.officialGuild.name ?? 'nao resolvido'}**`,
            report.officialGuild.sessionSummary ?? 'Sem resumo de sessao para a guild oficial.',
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Runtime e saude inicial',
          value: [
            `Node: **${report.nodeVersion}**`,
            `Ambiente: **${report.runtimeLabel}**`,
            ...report.checks.map((check) => `${check.label}: **${formatCheckStatus(check.status)}** - ${check.detail}`),
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Observabilidade',
          value: [
            `Falhas nesta execucao: **${report.liveFailureCount}**`,
            `Recoveries ativos: **${report.activeRecoveryCount}**`,
            `Warnings persistidos: **${report.runtimeWarningCount}**`,
            `Incidentes recentes persistidos: **${report.recentIncidentCount}**`,
          ].join('\n'),
          inline: false,
        },
        {
          name: 'Alertas criticos',
          value:
            report.criticalIssues.length > 0
              ? report.criticalIssues.map((issue) => `- ${issue}`).join('\n')
              : 'Nenhum problema critico foi detectado nesta subida.',
          inline: false,
        },
      ],
      hint:
        trigger === 'startup'
          ? 'Use `/owner status`, `/owner incidents` ou `/owner official-guild` para aprofundar a operacao sem depender de logs soltos.'
          : 'Se este aviso chegou no privado, o fluxo de notificacao do owner esta funcional nesta execucao.',
    });
  }

  private async checkDatabase(): Promise<OwnerCheck> {
    try {
      await this.deps.prisma.guildSettings.count();
      await this.deps.prisma.operationalIncident.count();

      return {
        label: 'Database',
        status: 'ok',
        detail: `SQLite respondendo em ${this.deps.config.databaseUrl}.`,
      };
    } catch (error) {
      return {
        label: 'Database',
        status: 'error',
        detail: `Falha ao acessar o banco: ${formatErrorMessage(error)}.`,
      };
    }
  }

  private checkFfmpeg(): OwnerCheck {
    if (this.deps.ffmpeg.available) {
      return {
        label: 'FFmpeg',
        status: 'ok',
        detail: `${this.deps.ffmpeg.executable} pronto. ${this.deps.ffmpeg.detail}`,
      };
    }

    return {
      label: 'FFmpeg',
      status: 'error',
      detail: `${this.deps.ffmpeg.executable} indisponivel. ${this.deps.ffmpeg.detail}`,
    };
  }

  private async checkSlashCommands(client: Client): Promise<OwnerCheck> {
    const scope = this.deps.config.discordGuildId ? 'guild' : 'global';

    try {
      if (scope === 'guild') {
        const targetGuild =
          client.guilds.cache.get(this.deps.config.discordGuildId!) ??
          (await client.guilds.fetch(this.deps.config.discordGuildId!).catch(() => null));

        if (!targetGuild) {
          return {
            label: 'Slash commands',
            status: 'warning',
            detail: `Escopo guild configurado para ${this.deps.config.discordGuildId}, mas essa guild nao ficou acessivel nesta sessao.`,
          };
        }

        const commands = await targetGuild.commands.fetch();
        return {
          label: 'Slash commands',
          status: commands.size === this.deps.expectedSlashCommands ? 'ok' : 'warning',
          detail:
            commands.size === this.deps.expectedSlashCommands
              ? `Escopo guild em ${targetGuild.id}. ${commands.size} comandos publicados e alinhados com o registry.`
              : `Escopo guild em ${targetGuild.id}. Esperado ${this.deps.expectedSlashCommands} e encontrei ${commands.size}.`,
        };
      }

      const commands = await client.application?.commands.fetch();
      if (!commands) {
        return {
          label: 'Slash commands',
          status: 'warning',
          detail: 'A aplicacao ainda nao expos o catalogo de slash commands para leitura.',
        };
      }

      return {
        label: 'Slash commands',
        status: commands.size === this.deps.expectedSlashCommands ? 'ok' : 'warning',
        detail:
          commands.size === this.deps.expectedSlashCommands
            ? `Escopo global. ${commands.size} comandos publicados e alinhados com o registry.`
            : `Escopo global. Esperado ${this.deps.expectedSlashCommands} e encontrei ${commands.size}.`,
      };
    } catch (error) {
      return {
        label: 'Slash commands',
        status: 'warning',
        detail: `Nao foi possivel consultar os slash commands: ${formatErrorMessage(error)}.`,
      };
    }
  }

  private checkPlaybackPipeline(): OwnerCheck {
    const routes = this.music?.describePlaybackRoutes() ?? describeConfiguredPlaybackRoutes(this.deps.config.spotify.enabled, this.deps.config.youtube);

    return {
      label: 'Playback pipeline',
      status: routes.youtube.requestedProfile === 'fidelity' && routes.youtube.effectiveProfile !== 'fidelity' ? 'warning' : 'ok',
      detail: [
        `YouTube em **${routes.youtube.pipeline}** com perfil efetivo **${routes.youtube.effectiveProfile}**, client **${routes.youtube.client}** e poToken **${routes.youtube.generateWithPoToken ? 'ativo' : 'inativo'}**.`,
        routes.youtube.downgradeReason,
        this.deps.config.spotify.enabled
          ? `Spotify aceito por **${routes.spotify.pipeline}** (${routes.spotify.routeKind}).`
          : 'Spotify desativado.',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }

  private checkDashboardRuntime(): OwnerCheck {
    const dashboard = resolveDashboardConfig(this.deps.config.dashboard);

    if (!dashboard.requestedEnabled) {
      return {
        label: 'Dashboard',
        status: 'ok',
        detail: 'Admin Center opt-in desativado por ambiente.',
      };
    }

    if (!dashboard.effectiveEnabled) {
      return {
        label: 'Dashboard',
        status: 'warning',
        detail: dashboard.disableReason ?? 'Dashboard solicitado, mas ainda nao ficou efetivo.',
      };
    }

    return {
      label: 'Dashboard',
      status: 'ok',
      detail: `Admin Center ativo em ${dashboard.baseUrl ?? 'baseUrl ausente'} na porta ${dashboard.port}.`,
    };
  }

  private checkObservability(client: Client, runtimeWarningCount: number, recentIncidentCount: number): OwnerCheck {
    const liveTelemetry = this.buildLiveTelemetrySummary(client);

    if (liveTelemetry.failureCount === 0 && runtimeWarningCount === 0 && liveTelemetry.activeRecoveryCount === 0) {
      return {
        label: 'Observabilidade',
        status: 'ok',
        detail: 'Nenhuma falha ativa, nenhum recovery pendente e nenhum warning persistido relevante.',
      };
    }

    return {
      label: 'Observabilidade',
      status: liveTelemetry.failureCount > 0 ? 'warning' : 'ok',
      detail: `Falhas nesta execucao=${liveTelemetry.failureCount}. Recoveries ativos=${liveTelemetry.activeRecoveryCount}. Incidentes persistidos recentes=${recentIncidentCount}. Warnings persistidos=${runtimeWarningCount}.`,
    };
  }

  private buildLiveTelemetrySummary(client: Client) {
    let failureCount = 0;
    let activeRecoveryCount = 0;

    for (const guild of client.guilds.cache.values()) {
      const snapshot = this.deps.operationalTelemetry.getGuildSnapshot(guild.id);
      failureCount += snapshot.failures.total;
      activeRecoveryCount += snapshot.recoveries.active ? 1 : 0;
    }

    return {
      failureCount,
      activeRecoveryCount,
    };
  }

  private async resolveOfficialGuildStatus(client: Client): Promise<OwnerOfficialGuildStatus> {
    const officialGuild =
      client.guilds.cache.get(PHONIX_OFFICIAL_GUILD_ID) ??
      (await client.guilds.fetch(PHONIX_OFFICIAL_GUILD_ID).catch(() => null));

    if (!officialGuild) {
      return {
        id: PHONIX_OFFICIAL_GUILD_ID,
        present: false,
        name: null,
        memberCount: null,
        settingsSummary: null,
        sessionSummary: null,
        detail: `A guild oficial ${PHONIX_OFFICIAL_GUILD_ID} nao ficou acessivel nesta sessao do bot.`,
        status: 'warning',
      };
    }

    const [settings, persistedSession, diagnostics] = await Promise.all([
      this.deps.guildSettings.getSettings(officialGuild.id).catch(() => null),
      this.deps.playbackSessions.get(officialGuild.id).catch(() => null),
      this.playbackSessionManager?.getDiagnostics(officialGuild.id).catch(() => null) ?? Promise.resolve(null),
    ]);
    const queue = this.deps.player.nodes.get(officialGuild.id);
    const queueState = queue ? (queue.currentTrack ? `tocando **${queue.currentTrack.title}**` : `fila com **${queue.size}** item(ns)`) : 'sem fila ativa';
    const settingsSummary = settings
      ? `Prefixo **${settings.prefix}**, autoplay **${settings.autoplayEnabled ? 'on' : 'off'}**, resume queue **${settings.resumeQueueEnabled ? 'on' : 'off'}**.`
      : null;
    const sessionSummary = [
      `Ao vivo: **${queueState}**`,
      diagnostics ? `Diagnostics: **${diagnostics.state}**` : null,
      persistedSession
        ? `Persistida: **${persistedSession.items.length + Number(Boolean(persistedSession.currentTrack))}** faixa(s).`
        : 'Persistida: **nenhuma**.',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      id: officialGuild.id,
      present: true,
      name: officialGuild.name,
      memberCount: officialGuild.memberCount ?? null,
      settingsSummary,
      sessionSummary,
      detail: `O bot esta presente na guild oficial **${officialGuild.name}** e conseguiu resolver o estado basico dela.`,
      status: 'ok',
    };
  }
}

function formatCheckStatus(status: OwnerCheckStatus) {
  if (status === 'ok') {
    return 'ok';
  }

  if (status === 'warning') {
    return 'aviso';
  }

  return 'erro';
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'erro desconhecido';
}

function formatIncidentLine(client: Client, incident: OperationalIncident) {
  const guildName =
    incident.guildId && client.guilds.cache.has(incident.guildId)
      ? client.guilds.cache.get(incident.guildId)?.name
      : incident.guildId
        ? incident.guildId
        : 'global';

  return [
    `**${incident.category}**`,
    `[${guildName ?? 'desconhecida'}]`,
    incident.code ? inlineValue(incident.code) : null,
    truncateLine(incident.message, 90),
  ]
    .filter(Boolean)
    .join(' ');
}

function inlineValue(value: string) {
  return `\`${value}\``;
}

function truncateLine(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}
