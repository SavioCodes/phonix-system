import { randomBytes } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import { z } from 'zod';
import type { Client } from 'discord.js';
import type { AppConfig, ResolvedDashboardConfig } from '../../../core/config/env.js';
import { APP_VERSION } from '../../../core/config/version.js';
import { logger } from '../../../core/logging/logger.js';
import { toCommandError } from '../../commands/errors.js';
import type {
  DashboardDoctorView,
  DashboardGuildSummary,
  DashboardIncidentsView,
  DashboardOverviewView,
  DashboardSessionRecord,
  DashboardSessionView,
} from '../contracts.js';
import type { DiscordOAuthClient, DiscordOAuthGuild } from '../services/discordOAuthService.js';
import type {
  DashboardSessionOAuthTokenSet,
  DashboardSessionsService,
} from '../services/dashboardSessionsService.js';
import type { createDashboardUseCases } from '../use-cases/dashboardUseCases.js';

const SESSION_COOKIE = 'phonix_dashboard_session';
const OAUTH_STATE_COOKIE = 'phonix_dashboard_oauth_state';
const CSRF_COOKIE = 'phonix_dashboard_csrf';
const DASHBOARD_AUTH_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const OAUTH_REFRESH_SKEW_MS = 60 * 1000;

const settingsPatchSchema = z
  .object({
    prefix: z.string().min(1).max(5).optional(),
    defaultVolume: z.number().int().min(0).max(150).optional(),
    autoplayEnabled: z.boolean().optional(),
    resumeQueueEnabled: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.prefix !== undefined ||
      value.defaultVolume !== undefined ||
      value.autoplayEnabled !== undefined ||
      value.resumeQueueEnabled !== undefined,
    {
      message: 'Nenhuma alteracao de configuracao foi enviada.',
    },
  );

interface CreateDashboardServerDeps {
  config: AppConfig;
  dashboard: ResolvedDashboardConfig;
  client: Client;
  authClient: DiscordOAuthClient;
  sessions: Pick<DashboardSessionsService, 'create' | 'get' | 'update' | 'delete' | 'verifyCsrf'>;
  useCases: ReturnType<typeof createDashboardUseCases>;
}

interface DashboardSessionBundle {
  session: DashboardSessionRecord;
  csrfToken: string | null;
}

class DashboardHttpError extends Error {
  public constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'DashboardHttpError';
  }
}

export async function createDashboardServer(deps: CreateDashboardServerDeps): Promise<FastifyInstance> {
  const appVersion = deps.config.appVersion ?? APP_VERSION;
  const app = Fastify({
    logger: false,
  });

  await app.register(cookie, {
    secret: deps.dashboard.sessionSecret ?? randomToken(),
  });

  app.get('/dashboard/login', async (_request, reply) => {
    const state = randomToken(16);
    reply.setCookie(OAUTH_STATE_COOKIE, state, signedCookieOptions(deps.dashboard));

    const authorizeUrl = new URL('https://discord.com/api/oauth2/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', deps.config.discordClientId);
    authorizeUrl.searchParams.set('scope', 'identify guilds');
    authorizeUrl.searchParams.set('redirect_uri', `${deps.dashboard.baseUrl}/dashboard/callback`);
    authorizeUrl.searchParams.set('state', state);

    return reply.redirect(authorizeUrl.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/dashboard/callback',
    async (request, reply) => {
      if (request.query.error) {
        return reply
          .status(400)
          .type('text/html; charset=utf-8')
          .send(renderErrorPage(appVersion, 'Falha no login Discord', 'O Discord retornou um erro durante o login do dashboard.'));
      }

      const cookieState = readSignedCookie(request, OAUTH_STATE_COOKIE);
      clearOAuthStateCookie(reply, deps.dashboard);

      if (!request.query.code || !request.query.state || !cookieState || cookieState !== request.query.state) {
        return reply
          .status(400)
          .type('text/html; charset=utf-8')
          .send(renderErrorPage(appVersion, 'State invalido', 'O login do dashboard nao pode ser validado. Tente iniciar o fluxo novamente.'));
      }

      const token = await deps.authClient.exchangeCode(request.query.code);
      const [user, userGuilds] = await Promise.all([
        deps.authClient.fetchUser(token.accessToken),
        deps.authClient.fetchGuilds(token.accessToken),
      ]);

      const authorizedGuildIds = filterAuthorizedGuildIds(deps.client, userGuilds);

      const csrfToken = randomToken();
      const session = await deps.sessions.create({
        discordUserId: user.id,
        username: user.globalName ?? user.username,
        avatar: buildDiscordAvatarUrl(user.id, user.avatar),
        authorizedGuildIds,
        csrfToken,
        oauth: toDashboardOAuthTokenSet(token),
        lastAuthorizedSyncAt: new Date(),
      });

      reply.setCookie(SESSION_COOKIE, session.id, signedCookieOptions(deps.dashboard));
      reply.setCookie(CSRF_COOKIE, csrfToken, csrfCookieOptions(deps.dashboard));
      return reply.redirect('/dashboard');
    },
  );

  app.get<{ Querystring: { guildId?: string } }>('/dashboard', async (request, reply) => {
    const bundle = await getDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    if (!bundle) {
      return reply.type('text/html; charset=utf-8').send(renderLandingPage(appVersion));
    }

    const guilds = await deps.useCases.listGuilds(bundle.session.authorizedGuildIds);
    if (guilds.length === 0) {
      return reply.type('text/html; charset=utf-8').send(renderNoEligibleGuildsPage(appVersion, bundle.session));
    }

    const selectedGuild = guilds.find((guild) => guild.id === request.query.guildId) ?? guilds[0];
    const [overview, doctor, incidents, settings, sessionView] = await Promise.all([
      deps.useCases.getOverview(selectedGuild.id),
      deps.useCases.getDoctor(selectedGuild.id),
      deps.useCases.getIncidents(selectedGuild.id),
      deps.useCases.getSettings(selectedGuild.id),
      deps.useCases.getSession(selectedGuild.id),
    ]);

    return reply.type('text/html; charset=utf-8').send(
      renderDashboardPage({
        appVersion,
        viewer: bundle.session,
        csrfToken: bundle.csrfToken,
        guilds,
        selectedGuildId: selectedGuild.id,
        overview,
        doctor,
        incidents,
        settings,
        session: sessionView,
      }),
    );
  });

  app.post('/dashboard/logout', async (request, reply) => {
    const sessionId = readSignedCookie(request, SESSION_COOKIE);
    if (sessionId) {
      await deps.sessions.delete(sessionId);
    }

    clearDashboardCookies(reply, deps.dashboard);
    return reply.send({ ok: true });
  });

  app.get('/api/dashboard/me', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    return reply.send({
      id: bundle.session.discordUserId,
      username: bundle.session.username,
      avatarUrl: bundle.session.avatar,
      authorizedGuildIds: bundle.session.authorizedGuildIds,
      csrfToken: bundle.csrfToken,
      lastAuthorizedSyncAt: bundle.session.lastAuthorizedSyncAt,
      appVersion,
    });
  });

  app.get('/api/dashboard/guilds', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    return reply.send(await deps.useCases.listGuilds(bundle.session.authorizedGuildIds));
  });

  app.get<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/overview', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    return reply.send(await deps.useCases.getOverview(request.params.guildId));
  });

  app.get<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/doctor', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    return reply.send(await deps.useCases.getDoctor(request.params.guildId));
  });

  app.get<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/incidents', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    return reply.send(await deps.useCases.getIncidents(request.params.guildId));
  });

  app.get<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/settings', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    return reply.send(await deps.useCases.getSettings(request.params.guildId));
  });

  app.get<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/session', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      refreshIfStale: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    return reply.send(await deps.useCases.getSession(request.params.guildId));
  });

  app.patch<{ Params: { guildId: string }; Body: unknown }>(
    '/api/dashboard/guilds/:guildId/settings',
    async (request, reply) => {
      const bundle = await requireDashboardSession(request, reply, deps, {
        forceAuthorizationRefresh: true,
      });
      ensureGuildAccess(bundle.session, request.params.guildId);
      await requireCsrf(request, deps.sessions, bundle.session);

      const patch = settingsPatchSchema.parse(request.body);
      return reply.send(await deps.useCases.updateSettings(request.params.guildId, patch));
    },
  );

  app.post<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/recover', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      forceAuthorizationRefresh: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    await requireCsrf(request, deps.sessions, bundle.session);
    return reply.send(await deps.useCases.recover(request.params.guildId));
  });

  app.post<{ Params: { guildId: string } }>('/api/dashboard/guilds/:guildId/stop', async (request, reply) => {
    const bundle = await requireDashboardSession(request, reply, deps, {
      forceAuthorizationRefresh: true,
    });
    ensureGuildAccess(bundle.session, request.params.guildId);
    await requireCsrf(request, deps.sessions, bundle.session);
    return reply.send(await deps.useCases.stop(request.params.guildId));
  });

  app.setErrorHandler((error, request, reply) => {
    const wantsJson =
      request.url.startsWith('/api/') ||
      request.headers.accept?.includes('application/json') ||
      request.headers['content-type']?.includes('application/json');

    if (error instanceof DashboardHttpError) {
      if (wantsJson) {
        return reply.status(error.statusCode).send({
          error: {
            title: 'PHONIX | Dashboard',
            message: error.message,
          },
        });
      }

      return reply
        .status(error.statusCode)
        .type('text/html; charset=utf-8')
        .send(renderErrorPage(appVersion, 'PHONIX | Dashboard', error.message));
    }

    const commandError = toCommandError(error);
    const statusCode = resolveStatusCode(commandError.kind);

    if (wantsJson) {
      return reply.status(statusCode).send({
        error: {
          title: commandError.title,
          message: commandError.expose ? commandError.message : 'O PHONIX encontrou um erro interno ao processar esta operacao.',
          kind: commandError.kind,
        },
      });
    }

    logger.warn({ err: error }, 'Dashboard request failed');
    return reply
      .status(statusCode)
      .type('text/html; charset=utf-8')
      .send(
        renderErrorPage(
          appVersion,
          commandError.title,
          commandError.expose ? commandError.message : 'O PHONIX encontrou um erro interno ao processar esta operacao.',
        ),
      );
  });

  return app;
}

interface ResolveSessionOptions {
  refreshIfStale?: boolean;
  forceAuthorizationRefresh?: boolean;
}

async function getDashboardSession(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Pick<CreateDashboardServerDeps, 'dashboard' | 'client' | 'authClient' | 'sessions'>,
  options: ResolveSessionOptions = {},
): Promise<DashboardSessionBundle | null> {
  const sessionId = readSignedCookie(request, SESSION_COOKIE);
  if (!sessionId) {
    return null;
  }

  const session = await deps.sessions.get(sessionId);
  if (!session) {
    clearDashboardCookies(reply, deps.dashboard);
    return null;
  }

  const shouldRefresh =
    options.forceAuthorizationRefresh ||
    (options.refreshIfStale && isAuthorizationSyncStale(session));
  const syncedSession = shouldRefresh ? await syncDashboardSessionAuthorization(session, deps) : session;
  if (!syncedSession) {
    clearDashboardCookies(reply, deps.dashboard);
    return null;
  }

  return {
    session: syncedSession,
    csrfToken: request.cookies[CSRF_COOKIE] ?? null,
  };
}

async function requireDashboardSession(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: Pick<CreateDashboardServerDeps, 'dashboard' | 'client' | 'authClient' | 'sessions'>,
  options: ResolveSessionOptions = {},
): Promise<DashboardSessionBundle> {
  const bundle = await getDashboardSession(request, reply, deps, options);
  if (!bundle) {
    throw new DashboardHttpError(401, 'A sessao do dashboard esta ausente ou expirou. Faca login novamente.');
  }

  return bundle;
}

async function syncDashboardSessionAuthorization(
  session: DashboardSessionRecord,
  deps: Pick<CreateDashboardServerDeps, 'client' | 'authClient' | 'sessions'>,
): Promise<DashboardSessionRecord | null> {
  if (!session.oauthAccessToken || !session.oauthRefreshToken || !session.oauthExpiresAt) {
    await deps.sessions.delete(session.id);
    return null;
  }

  try {
    const refreshToken = session.oauthRefreshToken;
    let oauth: DashboardSessionOAuthTokenSet = {
      accessToken: session.oauthAccessToken,
      refreshToken,
      tokenType: session.oauthTokenType ?? 'Bearer',
      scope: session.oauthScope ?? 'identify guilds',
      expiresAt: session.oauthExpiresAt,
    };

    if (oauth.expiresAt.getTime() <= Date.now() + OAUTH_REFRESH_SKEW_MS) {
      const refreshedToken = await deps.authClient.refreshAccessToken(refreshToken);
      oauth = {
        accessToken: refreshedToken.accessToken,
        refreshToken: refreshedToken.refreshToken ?? oauth.refreshToken,
        tokenType: refreshedToken.tokenType,
        scope: refreshedToken.scope,
        expiresAt: new Date(Date.now() + refreshedToken.expiresIn * 1000),
      };
    }

    const userGuilds = await deps.authClient.fetchGuilds(oauth.accessToken);
    const authorizedGuildIds = filterAuthorizedGuildIds(deps.client, userGuilds);

    return await deps.sessions.update(session.id, {
      authorizedGuildIds,
      oauth,
      lastAuthorizedSyncAt: new Date(),
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        discordUserId: session.discordUserId,
        sessionId: session.id,
      },
      'Dashboard session authorization refresh failed',
    );
    await deps.sessions.delete(session.id);
    return null;
  }
}

async function requireCsrf(
  request: FastifyRequest,
  sessions: Pick<DashboardSessionsService, 'verifyCsrf'>,
  session: DashboardSessionRecord,
) {
  const providedToken = extractCsrfToken(request.headers, request.body);
  const cookieToken = request.cookies[CSRF_COOKIE] ?? null;

  if (!providedToken || !cookieToken || providedToken !== cookieToken) {
    throw new DashboardHttpError(403, 'Falha de CSRF: atualize a pagina e tente novamente.');
  }

  const isValid = await sessions.verifyCsrf(session.id, providedToken);
  if (!isValid) {
    throw new DashboardHttpError(403, 'Falha de CSRF: o token de mutacao nao e mais valido.');
  }
}

function ensureGuildAccess(session: DashboardSessionRecord, guildId: string) {
  if (!session.authorizedGuildIds.includes(guildId)) {
    throw new DashboardHttpError(403, 'Voce nao tem acesso administrativo a essa guild pelo dashboard.');
  }
}

function isAuthorizationSyncStale(session: DashboardSessionRecord) {
  if (!session.lastAuthorizedSyncAt) {
    return true;
  }

  return session.lastAuthorizedSyncAt.getTime() + DASHBOARD_AUTH_SYNC_INTERVAL_MS <= Date.now();
}

function filterAuthorizedGuildIds(client: Client, userGuilds: DiscordOAuthGuild[]) {
  return userGuilds
    .filter((guild) => client.guilds.cache.has(guild.id))
    .filter((guild) => hasAdministratorPermission(guild.permissions))
    .map((guild) => guild.id);
}

function hasAdministratorPermission(permissions: string) {
  try {
    return (BigInt(permissions) & 0x8n) === 0x8n;
  } catch {
    return false;
  }
}

function readSignedCookie(request: FastifyRequest, name: string) {
  const rawValue = request.cookies[name];
  if (!rawValue) {
    return null;
  }

  const unsigned = request.unsignCookie(rawValue);
  return unsigned.valid ? unsigned.value : null;
}

function extractCsrfToken(headers: IncomingHttpHeaders, body: unknown) {
  const headerToken = headers['x-csrf-token'];
  if (typeof headerToken === 'string' && headerToken.trim()) {
    return headerToken;
  }

  if (body && typeof body === 'object' && 'csrfToken' in body && typeof (body as { csrfToken?: unknown }).csrfToken === 'string') {
    return (body as { csrfToken: string }).csrfToken;
  }

  return null;
}

function signedCookieOptions(dashboard: ResolvedDashboardConfig) {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax' as const,
    signed: true,
    secure: isSecureCookie(dashboard.baseUrl),
  };
}

function csrfCookieOptions(dashboard: ResolvedDashboardConfig) {
  return {
    path: '/',
    httpOnly: false,
    sameSite: 'lax' as const,
    signed: false,
    secure: isSecureCookie(dashboard.baseUrl),
  };
}

function clearDashboardCookies(reply: FastifyReply, dashboard: ResolvedDashboardConfig) {
  reply.clearCookie(SESSION_COOKIE, signedCookieOptions(dashboard));
  reply.clearCookie(CSRF_COOKIE, csrfCookieOptions(dashboard));
  clearOAuthStateCookie(reply, dashboard);
}

function clearOAuthStateCookie(reply: FastifyReply, dashboard: ResolvedDashboardConfig) {
  reply.clearCookie(OAUTH_STATE_COOKIE, signedCookieOptions(dashboard));
}

function isSecureCookie(baseUrl: string | null) {
  return Boolean(baseUrl?.startsWith('https://'));
}

function randomToken(size = 32) {
  return randomBytes(size).toString('hex');
}

function toDashboardOAuthTokenSet(token: Awaited<ReturnType<DiscordOAuthClient['exchangeCode']>>): DashboardSessionOAuthTokenSet {
  return {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    tokenType: token.tokenType,
    scope: token.scope,
    expiresAt: new Date(Date.now() + token.expiresIn * 1000),
  };
}

function resolveStatusCode(kind: ReturnType<typeof toCommandError>['kind']) {
  if (kind === 'authorization') {
    return 403;
  }

  if (kind === 'precondition') {
    return 412;
  }

  if (kind === 'conflict') {
    return 409;
  }

  if (kind === 'dependency') {
    return 424;
  }

  if (kind === 'validation') {
    return 400;
  }

  return 500;
}

function buildDiscordAvatarUrl(userId: string, avatar: string | null) {
  if (!avatar) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${userId}/${avatar}.png?size=128`;
}

function renderLandingPage(appVersion: string) {
  return renderPage({
    appVersion,
    title: 'PHONIX Admin Center',
    content: `
      <section class="hero">
        <div>
          <p class="eyebrow">PHONIX v${escapeHtml(appVersion)}</p>
          <h1>Admin Center</h1>
          <p>Uma central administrativa segura para revisar configuracoes, diagnostico, recovery e estado operacional por guild sem substituir os comandos do Discord.</p>
        </div>
        <a class="button primary" href="/dashboard/login">Entrar com Discord</a>
      </section>
    `,
  });
}

function renderNoEligibleGuildsPage(appVersion: string, session: DashboardSessionRecord) {
  return renderPage({
    appVersion,
    title: 'PHONIX Admin Center',
    content: `
      <section class="hero">
        <div>
          <p class="eyebrow">PHONIX v${escapeHtml(appVersion)}</p>
          <h1>Sem guilds elegiveis</h1>
          <p>Voce entrou com sucesso como <strong>${escapeHtml(session.username)}</strong>, mas ainda nao foi encontrado nenhum servidor em que voce seja administrador e o PHONIX esteja instalado.</p>
          <p class="hint">A autorizacao web e revalidada ao longo da sessao. Se o acesso foi revogado recentemente, faca login novamente depois de ajustar as permissoes no Discord.</p>
        </div>
        <button class="button secondary" data-logout>Encerrar sessao</button>
      </section>
      ${renderDashboardScript({ selectedGuildId: '', csrfToken: null })}
    `,
  });
}

function renderErrorPage(appVersion: string, title: string, description: string) {
  return renderPage({
    appVersion,
    title,
    content: `
      <section class="hero">
        <div>
          <p class="eyebrow">PHONIX v${escapeHtml(appVersion)}</p>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
        <a class="button secondary" href="/dashboard">Voltar ao dashboard</a>
      </section>
    `,
  });
}

function renderDashboardPage(input: {
  appVersion: string;
  viewer: DashboardSessionRecord;
  csrfToken: string | null;
  guilds: DashboardGuildSummary[];
  selectedGuildId: string;
  overview: DashboardOverviewView;
  doctor: DashboardDoctorView;
  incidents: DashboardIncidentsView;
  settings: Awaited<ReturnType<ReturnType<typeof createDashboardUseCases>['getSettings']>>;
  session: DashboardSessionView;
}) {
  const settings = input.settings.settings;
  const queue = input.overview.queue;
  const persisted = input.session.persistedSession;
  const report = input.doctor.report;

  return renderPage({
    appVersion: input.appVersion,
    title: `PHONIX Admin Center | ${input.overview.guild.name}`,
    content: `
      <header class="header">
        <div>
          <p class="eyebrow">PHONIX v${escapeHtml(input.appVersion)}</p>
          <h1>Admin Center</h1>
          <p>${escapeHtml(input.viewer.username)} conectado. O bot continua sendo controlado pelo Discord; este painel foca em config, diagnostico, recovery e operacoes seguras.</p>
          <p class="hint">Acesso administrativo sincronizado em ${escapeHtml(input.viewer.lastAuthorizedSyncAt?.toISOString() ?? 'indisponivel')}.</p>
        </div>
        <div class="toolbar">
          <span class="pill">${escapeHtml(input.overview.guild.name)}</span>
          <button class="button secondary" data-logout>Encerrar sessao</button>
        </div>
      </header>

      <nav class="guild-nav">
        ${input.guilds
          .map(
            (guild) => `
              <a class="guild-link ${guild.id === input.selectedGuildId ? 'active' : ''}" href="/dashboard?guildId=${encodeURIComponent(guild.id)}">
                ${escapeHtml(guild.name)}
              </a>
            `,
          )
          .join('')}
      </nav>

      <section class="grid two">
        <article class="card">
          <h2>Overview</h2>
          <dl class="meta">
            ${metaRow('Bot', input.overview.botTag ?? 'Indisponivel')}
            ${metaRow('Fila ativa', queue.active ? 'Sim' : 'Nao')}
            ${metaRow('Faixa atual', queue.currentTrackTitle ?? 'Nenhuma')}
            ${metaRow('Canal de voz', queue.voiceChannelName ?? 'Nenhum')}
            ${metaRow('Bitrate alvo', queue.bitrateKbps ? `${queue.bitrateKbps} kbps` : 'Indisponivel')}
            ${metaRow('Canal de texto', queue.textChannelName ?? 'Indisponivel')}
            ${metaRow('Volume ao vivo', queue.liveVolume !== null ? `${queue.liveVolume}%` : 'Sem fila ativa')}
            ${metaRow('Resume queue', formatSessionState(input.overview.recovery.state))}
          </dl>
        </article>

        <article class="card">
          <h2>Playback Pipeline</h2>
          <dl class="meta">
            ${metaRow(
              'YouTube',
              `${input.overview.playback.youtube.requestedProfile} -> ${input.overview.playback.youtube.effectiveProfile} (${input.overview.playback.youtube.pipeline})`,
            )}
            ${metaRow('Client', input.overview.playback.youtube.client)}
            ${metaRow('Route', input.overview.playback.youtube.routeKind)}
            ${metaRow('Cookie', input.overview.playback.youtube.cookieConfigured ? 'Configurado' : 'Ausente')}
            ${metaRow('PoToken', input.overview.playback.youtube.generateWithPoToken ? 'Ativo' : 'Inativo')}
            ${metaRow(
              'highWaterMark',
              input.overview.playback.youtube.highWaterMark ? `${input.overview.playback.youtube.highWaterMark} bytes` : 'Padrao',
            )}
            ${metaRow(
              'Spotify',
              input.overview.playback.spotify.enabled
                ? `${input.overview.playback.spotify.pipeline} (${input.overview.playback.spotify.routeKind})`
                : 'Desativado',
            )}
          </dl>
          ${
            input.overview.playback.youtube.downgradeReason
              ? `<p class="hint">${escapeHtml(input.overview.playback.youtube.downgradeReason)}</p>`
              : ''
          }
          <p class="hint">Spotify hoje funciona por bridge. NAO IMPLEMENTADO AINDA: source:soundcloud como source direto.</p>
        </article>
      </section>

      <section class="grid two">
        <article class="card">
          <h2>Config</h2>
          <form id="settings-form" class="stack">
            <label><span>Prefixo</span><input name="prefix" value="${escapeHtml(settings.prefix)}" maxlength="5" /></label>
            <label><span>Volume padrao</span><input name="defaultVolume" type="number" min="0" max="150" value="${settings.defaultVolume}" /></label>
            <label class="checkbox"><input name="autoplayEnabled" type="checkbox" ${settings.autoplayEnabled ? 'checked' : ''} /><span>Autoplay padrao</span></label>
            <label class="checkbox"><input name="resumeQueueEnabled" type="checkbox" ${settings.resumeQueueEnabled ? 'checked' : ''} /><span>Resume queue</span></label>
            <button class="button primary" type="submit">Salvar configuracao</button>
          </form>
          <p class="hint">As alteracoes usam os mesmos servicos do bot e, quando possivel, refletem imediatamente na fila ativa.</p>
        </article>

        <article class="card">
          <h2>Operations</h2>
          <div class="stack">
            <button class="button primary" data-recover>Executar recover seguro</button>
            <button class="button danger" data-stop>Encerrar sessao atual</button>
          </div>
          <dl class="meta">
            ${metaRow('Estado', formatSessionState(input.session.diagnostics.state))}
            ${metaRow('Ultimo trigger', input.session.diagnostics.lastRecoveryTrigger ?? 'Nenhum')}
            ${metaRow('Ultimo bloqueio', input.session.diagnostics.lastAutoRecoverBlockReason ?? 'Nenhum')}
          </dl>
          ${
            persisted
              ? `<p class="hint">Sessao salva em ${escapeHtml(persisted.voiceChannelName ?? persisted.voiceChannelId)} com ${persisted.itemCount} faixa(s), atualizada em ${escapeHtml(persisted.updatedAt.toISOString())}.</p>`
              : '<p class="hint">Nao ha sessao persistida nesta guild no momento.</p>'
          }
        </article>
      </section>

      <section class="grid two">
        <article class="card">
          <h2>Diagnostics</h2>
          <p class="status status-${report.overallStatus}">
            ${escapeHtml(`Status ${report.overallStatus.toUpperCase()} | ${report.summary.ok} OK | ${report.summary.warning} avisos | ${report.summary.error} erros`)}
          </p>
          <div class="stack dense">
            ${report.checks
              .map(
                (check) => `
                  <div class="check">
                    <strong>${escapeHtml(check.label)}</strong>
                    <p>${escapeHtml(check.detail)}</p>
                  </div>
                `,
              )
              .join('')}
          </div>
          ${
            report.nextActions?.length
              ? `<div class="callout"><strong>Proximos passos</strong><ul>${report.nextActions.map((action) => `<li>${escapeHtml(action)}</li>`).join('')}</ul></div>`
              : ''
          }
        </article>

        <article class="card">
          <h2>Incidents recentes</h2>
          <div class="stack dense">
            ${
              input.incidents.incidents.length > 0
                ? input.incidents.incidents
                    .slice(0, 12)
                    .map(
                      (incident) => `
                        <div class="incident">
                          <strong>${escapeHtml(incident.category)}</strong>
                          <span>${escapeHtml(incident.type)}</span>
                          <p>${escapeHtml(incident.message)}</p>
                        </div>
                      `,
                    )
                    .join('')
                : '<p class="hint">Nenhum incidente recente registrado para esta guild.</p>'
            }
          </div>
        </article>
      </section>

      ${renderDashboardScript({ selectedGuildId: input.selectedGuildId, csrfToken: input.csrfToken })}
    `,
  });
}

function renderDashboardScript(input: { selectedGuildId: string; csrfToken: string | null }) {
  return `
    <script>
      const PHONIX_DASHBOARD = ${JSON.stringify(input)};
      async function callDashboardApi(url, method, body) {
        const response = await fetch(url, {
          method,
          headers: {
            'content-type': 'application/json',
            ...(PHONIX_DASHBOARD.csrfToken ? { 'x-csrf-token': PHONIX_DASHBOARD.csrfToken } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error?.message || 'A operacao do dashboard falhou.');
        }
        return payload;
      }
      document.getElementById('settings-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        try {
          await callDashboardApi('/api/dashboard/guilds/' + encodeURIComponent(PHONIX_DASHBOARD.selectedGuildId) + '/settings', 'PATCH', {
            prefix: form.prefix.value,
            defaultVolume: Number(form.defaultVolume.value),
            autoplayEnabled: form.autoplayEnabled.checked,
            resumeQueueEnabled: form.resumeQueueEnabled.checked,
          });
          window.location.reload();
        } catch (error) { alert(error.message); }
      });
      document.querySelector('[data-recover]')?.addEventListener('click', async () => {
        try {
          await callDashboardApi('/api/dashboard/guilds/' + encodeURIComponent(PHONIX_DASHBOARD.selectedGuildId) + '/recover', 'POST');
          window.location.reload();
        } catch (error) { alert(error.message); }
      });
      document.querySelector('[data-stop]')?.addEventListener('click', async () => {
        try {
          await callDashboardApi('/api/dashboard/guilds/' + encodeURIComponent(PHONIX_DASHBOARD.selectedGuildId) + '/stop', 'POST');
          window.location.reload();
        } catch (error) { alert(error.message); }
      });
      document.querySelector('[data-logout]')?.addEventListener('click', async () => {
        await fetch('/dashboard/logout', { method: 'POST' });
        window.location.href = '/dashboard';
      });
    </script>
  `;
}

function renderPage(input: { appVersion: string; title: string; content: string }) {
  return `<!doctype html>
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(input.title)}</title>
      <style>
        :root { --bg:#061423; --panel:#0d2338; --line:rgba(107,230,255,.16); --blue:#24a4ff; --cyan:#6be6ff; --text:#eef9ff; --danger:#ff6d7f; }
        * { box-sizing:border-box; } body { margin:0; font-family:Segoe UI, Inter, sans-serif; background:linear-gradient(160deg,#04101b,#091a2e 48%,#061423); color:var(--text); min-height:100vh; }
        main { width:min(1180px, calc(100vw - 2rem)); margin:0 auto; padding:2rem 0 3rem; } a { color:inherit; text-decoration:none; }
        .header,.hero,.stack { display:grid; gap:1rem; } .header{grid-template-columns:1fr auto;align-items:start;} .stack.dense{gap:.5rem;}
        .eyebrow { color:var(--cyan); letter-spacing:.12em; text-transform:uppercase; font-size:.78rem; margin:0 0 .5rem; } h1,h2{margin:0;} h1{font-size:clamp(2rem,4vw,3.4rem);} h2{font-size:1.2rem;margin-bottom:1rem;} p{margin:0;color:rgba(238,249,255,.82);}
        .guild-nav{display:flex;flex-wrap:wrap;gap:.75rem;margin:1.5rem 0;} .guild-link,.pill{border:1px solid var(--line);background:rgba(6,20,35,.72);padding:.7rem .95rem;border-radius:999px;} .guild-link.active{border-color:rgba(107,230,255,.5);}
        .grid{display:grid;gap:1rem;margin-bottom:1rem;} .grid.two{grid-template-columns:repeat(2,minmax(0,1fr));}
        .card,.check,.incident,.callout{background:rgba(13,35,56,.94);border:1px solid var(--line);border-radius:20px;padding:1rem;}
        .meta{display:grid;gap:.8rem;margin:0;} .meta div{display:grid;gap:.18rem;} .meta dt{font-size:.78rem;text-transform:uppercase;color:var(--cyan);letter-spacing:.08em;} .meta dd{margin:0;}
        .button{display:inline-flex;justify-content:center;align-items:center;border-radius:999px;padding:.8rem 1.1rem;border:none;cursor:pointer;font-weight:700;}
        .button.primary{background:linear-gradient(135deg,var(--blue),var(--cyan));color:#03101c;} .button.secondary{background:rgba(6,20,35,.72);color:var(--text);border:1px solid var(--line);} .button.danger{background:rgba(255,109,127,.14);color:#ffd9df;border:1px solid rgba(255,109,127,.3);}
        form label{display:grid;gap:.35rem;} input{background:rgba(4,16,27,.78);border:1px solid var(--line);color:var(--text);border-radius:14px;padding:.8rem .9rem;} .checkbox{grid-template-columns:auto 1fr;align-items:center;gap:.6rem;} .checkbox input{width:1rem;height:1rem;}
        .status{display:inline-block;border-radius:999px;padding:.45rem .75rem;margin-bottom:1rem;font-weight:700;} .status-ok{background:rgba(89,240,181,.14);color:#59f0b5;} .status-warning{background:rgba(107,230,255,.12);color:var(--cyan);} .status-error{background:rgba(255,109,127,.14);color:#ffd9df;}
        .hint{margin-top:.9rem;font-size:.95rem;color:rgba(238,249,255,.72);} footer{margin-top:1.6rem;color:rgba(238,249,255,.52);font-size:.9rem;}
        @media (max-width:860px){ .header,.grid.two{grid-template-columns:1fr;} }
      </style>
    </head>
    <body>
      <main>
        ${input.content}
        <footer>PHONIX v${escapeHtml(input.appVersion)} | Deep Space / Navy Core / Electric Blue / Cyan Signal / Ice White</footer>
      </main>
    </body>
  </html>`;
}

function metaRow(name: string, value: string) {
  return `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSessionState(state: DashboardSessionView['diagnostics']['state']) {
  if (state === 'recovering') {
    return 'Recuperando';
  }

  if (state === 'active') {
    return 'Ativa';
  }

  if (state === 'pending') {
    return 'Pendente';
  }

  return 'Nenhuma';
}
