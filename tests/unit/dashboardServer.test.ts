import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createDashboardServer } from '../../src/modules/dashboard/http/createDashboardServer.js';
import type { AppConfig, DashboardConfig, ResolvedDashboardConfig } from '../../src/core/config/env.js';
import type { DashboardSessionRecord } from '../../src/modules/dashboard/contracts.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('dashboard server', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('renders the landing page when the viewer is not authenticated', async () => {
    const { app } = await createTestServer();
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Admin Center');
    expect(response.body).toContain('Entrar com Discord');
  });

  it('creates a dashboard session through Discord OAuth and filters guilds by admin permission and bot installation', async () => {
    const authClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresIn: 3600,
      }),
      refreshAccessToken: vi.fn(),
      fetchUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        username: 'phonix-admin',
        globalName: 'Phonix Admin',
        avatar: null,
      }),
      fetchGuilds: vi.fn().mockResolvedValue([
        {
          id: 'guild-1',
          name: 'Guild 1',
          icon: null,
          permissions: String(0x8),
        },
        {
          id: 'guild-2',
          name: 'Guild 2',
          icon: null,
          permissions: String(0x8),
        },
        {
          id: 'guild-3',
          name: 'Guild 3',
          icon: null,
          permissions: '0',
        },
      ]),
    };

    const { app, sessionStore } = await createTestServer({
      authClient,
      installedGuildIds: ['guild-1', 'guild-3'],
    });
    apps.push(app);

    const loginResponse = await app.inject({
      method: 'GET',
      url: '/dashboard/login',
    });

    const state = new URL(loginResponse.headers.location ?? 'https://discord.invalid').searchParams.get('state');
    const loginCookies = toCookieHeader(loginResponse.headers['set-cookie']);

    const callbackResponse = await app.inject({
      method: 'GET',
      url: `/dashboard/callback?code=test-code&state=${state}`,
      headers: {
        cookie: loginCookies,
      },
    });

    expect(callbackResponse.statusCode).toBe(302);
    expect(callbackResponse.headers.location).toBe('/dashboard');
    expect(authClient.exchangeCode).toHaveBeenCalledWith('test-code');
    expect(sessionStore.lastCreated?.authorizedGuildIds).toEqual(['guild-1']);
    expect(sessionStore.lastCreated?.oauthAccessToken).toBe('token');
    expect(sessionStore.lastCreated?.oauthRefreshToken).toBe('refresh-token');

    const sessionCookies = parseCookies(callbackResponse.headers['set-cookie']);
    const guildsResponse = await app.inject({
      method: 'GET',
      url: '/api/dashboard/guilds',
      headers: {
        cookie: toCookieHeader(callbackResponse.headers['set-cookie']),
      },
    });

    expect(sessionCookies.phonix_dashboard_session).toBeDefined();
    expect(sessionCookies.phonix_dashboard_csrf).toBeDefined();
    expect(guildsResponse.statusCode).toBe(200);
    expect(guildsResponse.json()).toEqual([
      {
        id: 'guild-1',
        name: 'Guild 1',
        iconUrl: null,
      },
    ]);
  });

  it('rejects expired sessions, unauthorized guild access and mutations without CSRF', async () => {
    const { app, sessionStore } = await createTestServer();
    apps.push(app);

    const auth = await authenticate(app);
    const sessionId = sessionStore.lastCreated?.id;
    if (sessionId) {
      sessionStore.expire(sessionId);
    }

    const expiredResponse = await app.inject({
      method: 'GET',
      url: '/api/dashboard/me',
      headers: {
        cookie: auth.cookieHeader,
      },
    });

    expect(expiredResponse.statusCode).toBe(401);

    const auth2 = await authenticate(app);
    const forbiddenResponse = await app.inject({
      method: 'GET',
      url: '/api/dashboard/guilds/guild-2/overview',
      headers: {
        cookie: auth2.cookieHeader,
      },
    });
    expect(forbiddenResponse.statusCode).toBe(403);

    const csrfResponse = await app.inject({
      method: 'PATCH',
      url: '/api/dashboard/guilds/guild-1/settings',
      headers: {
        cookie: auth2.cookieHeader,
        'content-type': 'application/json',
      },
      payload: {
        prefix: '?',
      },
    });
    expect(csrfResponse.statusCode).toBe(403);
  });

  it('serves overview/session data and forwards config, recover, stop and logout operations', async () => {
    const { app, useCases } = await createTestServer();
    apps.push(app);

    const auth = await authenticate(app);

    const overviewResponse = await app.inject({
      method: 'GET',
      url: '/api/dashboard/guilds/guild-1/overview',
      headers: {
        cookie: auth.cookieHeader,
      },
    });
    expect(overviewResponse.statusCode).toBe(200);
    expect(overviewResponse.json().guild.name).toBe('Guild 1');

    const sessionResponse = await app.inject({
      method: 'GET',
      url: '/api/dashboard/guilds/guild-1/session',
      headers: {
        cookie: auth.cookieHeader,
      },
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json().diagnostics.state).toBe('pending');

    const settingsResponse = await app.inject({
      method: 'PATCH',
      url: '/api/dashboard/guilds/guild-1/settings',
      headers: {
        cookie: auth.cookieHeader,
        'content-type': 'application/json',
        'x-csrf-token': auth.csrfToken,
      },
      payload: {
        prefix: '?',
        defaultVolume: 88,
        autoplayEnabled: true,
        resumeQueueEnabled: true,
      },
    });

    expect(settingsResponse.statusCode).toBe(200);
    expect(useCases.updateSettings).toHaveBeenCalledWith('guild-1', {
      prefix: '?',
      defaultVolume: 88,
      autoplayEnabled: true,
      resumeQueueEnabled: true,
    });

    const recoverResponse = await app.inject({
      method: 'POST',
      url: '/api/dashboard/guilds/guild-1/recover',
      headers: {
        cookie: auth.cookieHeader,
        'x-csrf-token': auth.csrfToken,
      },
    });
    expect(recoverResponse.statusCode).toBe(200);
    expect(useCases.recover).toHaveBeenCalledWith('guild-1');

    const stopResponse = await app.inject({
      method: 'POST',
      url: '/api/dashboard/guilds/guild-1/stop',
      headers: {
        cookie: auth.cookieHeader,
        'x-csrf-token': auth.csrfToken,
      },
    });
    expect(stopResponse.statusCode).toBe(200);
    expect(useCases.stop).toHaveBeenCalledWith('guild-1');

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/dashboard/logout',
      headers: {
        cookie: auth.cookieHeader,
      },
    });
    expect(logoutResponse.statusCode).toBe(200);
    expect(useCases.stop).toHaveBeenCalledTimes(1);
  });

  it('revalidates administrative guild access before mutations and removes revoked access from the session', async () => {
    const authClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresIn: 3600,
      }),
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'token-2',
        refreshToken: 'refresh-token-2',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresIn: 3600,
      }),
      fetchUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        username: 'phonix-admin',
        globalName: 'Phonix Admin',
        avatar: null,
      }),
      fetchGuilds: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'guild-1',
            name: 'Guild 1',
            icon: null,
            permissions: String(0x8),
          },
        ])
        .mockResolvedValueOnce([]),
    };

    const { app, sessionStore } = await createTestServer({
      authClient,
    });
    apps.push(app);

    const auth = await authenticate(app);
    const sessionId = sessionStore.lastCreated?.id ?? '';
    sessionStore.expireOauth(sessionId);

    const recoverResponse = await app.inject({
      method: 'POST',
      url: '/api/dashboard/guilds/guild-1/recover',
      headers: {
        cookie: auth.cookieHeader,
        'x-csrf-token': auth.csrfToken,
      },
    });

    expect(recoverResponse.statusCode).toBe(403);
    expect(authClient.refreshAccessToken).toHaveBeenCalledWith('refresh-token');
    expect(sessionStore.getStored(sessionId)?.authorizedGuildIds).toEqual([]);
  });

  it('invalidates the dashboard session when OAuth refresh fails during revalidation', async () => {
    const authClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresIn: 3600,
      }),
      refreshAccessToken: vi.fn().mockRejectedValue(new Error('refresh failed')),
      fetchUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        username: 'phonix-admin',
        globalName: 'Phonix Admin',
        avatar: null,
      }),
      fetchGuilds: vi.fn().mockResolvedValue([
        {
          id: 'guild-1',
          name: 'Guild 1',
          icon: null,
          permissions: String(0x8),
        },
      ]),
    };

    const { app, sessionStore } = await createTestServer({
      authClient,
    });
    apps.push(app);

    const auth = await authenticate(app);
    const sessionId = sessionStore.lastCreated?.id ?? '';
    sessionStore.expireOauth(sessionId);
    sessionStore.markAuthorizationStale(sessionId);

    const response = await app.inject({
      method: 'GET',
      url: '/api/dashboard/me',
      headers: {
        cookie: auth.cookieHeader,
      },
    });

    expect(response.statusCode).toBe(401);
    expect(sessionStore.getStored(sessionId)).toBeNull();
  });

  it('shows the no eligible guilds state after authorization revalidation removes every guild', async () => {
    const authClient = {
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresIn: 3600,
      }),
      refreshAccessToken: vi.fn(),
      fetchUser: vi.fn().mockResolvedValue({
        id: 'user-1',
        username: 'phonix-admin',
        globalName: 'Phonix Admin',
        avatar: null,
      }),
      fetchGuilds: vi
        .fn()
        .mockResolvedValueOnce([
          {
            id: 'guild-1',
            name: 'Guild 1',
            icon: null,
            permissions: String(0x8),
          },
        ])
        .mockResolvedValueOnce([]),
    };

    const { app, sessionStore } = await createTestServer({
      authClient,
    });
    apps.push(app);

    const auth = await authenticate(app);
    const sessionId = sessionStore.lastCreated?.id ?? '';
    sessionStore.markAuthorizationStale(sessionId);

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard',
      headers: {
        cookie: auth.cookieHeader,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Sem guilds elegiveis');
    expect(sessionStore.getStored(sessionId)?.authorizedGuildIds).toEqual([]);
  });
});

async function createTestServer(options: {
  authClient?: {
    exchangeCode: ReturnType<typeof vi.fn>;
    refreshAccessToken: ReturnType<typeof vi.fn>;
    fetchUser: ReturnType<typeof vi.fn>;
    fetchGuilds: ReturnType<typeof vi.fn>;
  };
  installedGuildIds?: string[];
} = {}) {
  const sessionStore = createSessionStore();
  const useCases = createUseCaseStubs();
  const app = await createDashboardServer({
    config: createConfig(),
    dashboard: createResolvedDashboardConfig(),
    client: {
      guilds: {
        cache: new Map(
          (options.installedGuildIds ?? ['guild-1']).map((guildId) => [
            guildId,
            {
              id: guildId,
            },
          ]),
        ),
      },
    } as never,
    authClient: (options.authClient ??
      {
        exchangeCode: vi.fn().mockResolvedValue({
          accessToken: 'token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
          scope: 'identify guilds',
          expiresIn: 3600,
        }),
        refreshAccessToken: vi.fn().mockResolvedValue({
          accessToken: 'token-2',
          refreshToken: 'refresh-token-2',
          tokenType: 'Bearer',
          scope: 'identify guilds',
          expiresIn: 3600,
        }),
        fetchUser: vi.fn().mockResolvedValue({
          id: 'user-1',
          username: 'phonix-admin',
          globalName: 'Phonix Admin',
          avatar: null,
        }),
        fetchGuilds: vi.fn().mockResolvedValue([
          {
            id: 'guild-1',
            name: 'Guild 1',
            icon: null,
            permissions: String(0x8),
          },
        ]),
      }) as never,
    sessions: sessionStore,
    useCases,
  });

  return {
    app,
    sessionStore,
    useCases,
  };
}

async function authenticate(app: FastifyInstance) {
  const loginResponse = await app.inject({
    method: 'GET',
    url: '/dashboard/login',
  });
  const state = new URL(loginResponse.headers.location ?? 'https://discord.invalid').searchParams.get('state');

  const callbackResponse = await app.inject({
    method: 'GET',
    url: `/dashboard/callback?code=test-code&state=${state}`,
    headers: {
      cookie: toCookieHeader(loginResponse.headers['set-cookie']),
    },
  });

  const cookies = parseCookies(callbackResponse.headers['set-cookie']);
  return {
    cookieHeader: toCookieHeader(callbackResponse.headers['set-cookie']),
    csrfToken: cookies.phonix_dashboard_csrf ?? '',
  };
}

function createSessionStore() {
  const sessions = new Map<string, DashboardSessionRecord & { csrfToken: string }>();

  return {
    lastCreated: null as (DashboardSessionRecord & { csrfToken: string }) | null,
    async create(input: {
      discordUserId: string;
      username: string;
      avatar?: string | null;
      authorizedGuildIds: string[];
      csrfToken: string;
      oauth: {
        accessToken: string;
        refreshToken: string | null;
        tokenType: string;
        scope: string;
        expiresAt: Date;
      };
      lastAuthorizedSyncAt?: Date;
    }) {
      const session = {
        id: `session-${sessions.size + 1}`,
        discordUserId: input.discordUserId,
        username: input.username,
        avatar: input.avatar ?? null,
        authorizedGuildIds: input.authorizedGuildIds,
        csrfTokenHash: `hash-${input.csrfToken}`,
        oauthAccessToken: input.oauth.accessToken,
        oauthRefreshToken: input.oauth.refreshToken,
        oauthTokenType: input.oauth.tokenType,
        oauthScope: input.oauth.scope,
        oauthExpiresAt: input.oauth.expiresAt,
        lastAuthorizedSyncAt: input.lastAuthorizedSyncAt ?? new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        csrfToken: input.csrfToken,
      };

      sessions.set(session.id, session);
      this.lastCreated = session;
      return session;
    },
    async get(sessionId: string) {
      const session = sessions.get(sessionId) ?? null;
      if (!session) {
        return null;
      }

      if (session.expiresAt.getTime() <= Date.now()) {
        sessions.delete(sessionId);
        return null;
      }

      return session;
    },
    async update(
      sessionId: string,
      input: {
        username?: string;
        avatar?: string | null;
        authorizedGuildIds?: string[];
        oauth?: {
          accessToken: string;
          refreshToken: string | null;
          tokenType: string;
          scope: string;
          expiresAt: Date;
        };
        lastAuthorizedSyncAt?: Date | null;
        expiresAt?: Date;
      },
    ) {
      const session = sessions.get(sessionId);
      if (!session) {
        return null;
      }

      const updated = {
        ...session,
        ...(input.username !== undefined ? { username: input.username } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.authorizedGuildIds !== undefined ? { authorizedGuildIds: input.authorizedGuildIds } : {}),
        ...(input.oauth
          ? {
              oauthAccessToken: input.oauth.accessToken,
              oauthRefreshToken: input.oauth.refreshToken,
              oauthTokenType: input.oauth.tokenType,
              oauthScope: input.oauth.scope,
              oauthExpiresAt: input.oauth.expiresAt,
            }
          : {}),
        ...(input.lastAuthorizedSyncAt !== undefined ? { lastAuthorizedSyncAt: input.lastAuthorizedSyncAt } : {}),
        ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt } : {}),
        updatedAt: new Date(),
      };

      sessions.set(sessionId, updated);
      return updated;
    },
    async delete(sessionId: string) {
      sessions.delete(sessionId);
    },
    async verifyCsrf(sessionId: string, csrfToken: string) {
      const session = sessions.get(sessionId);
      return session?.csrfToken === csrfToken;
    },
    expire(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.expiresAt = new Date(Date.now() - 1);
      sessions.set(sessionId, session);
    },
    expireOauth(sessionId: string) {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.oauthExpiresAt = new Date(Date.now() - 1);
      sessions.set(sessionId, session);
    },
    markAuthorizationStale(sessionId: string, ageMs = 10 * 60 * 1000) {
      const session = sessions.get(sessionId);
      if (!session) {
        return;
      }

      session.lastAuthorizedSyncAt = new Date(Date.now() - ageMs);
      sessions.set(sessionId, session);
    },
    getStored(sessionId: string) {
      return sessions.get(sessionId) ?? null;
    },
  };
}

function createUseCaseStubs() {
  const guilds = [
    {
      id: 'guild-1',
      name: 'Guild 1',
      iconUrl: null,
    },
    {
      id: 'guild-2',
      name: 'Guild 2',
      iconUrl: null,
    },
  ];

  return {
    listGuilds: vi.fn().mockImplementation(async (guildIds: string[]) => guilds.filter((guild) => guildIds.includes(guild.id))),
    getOverview: vi.fn().mockResolvedValue({
      guild: guilds[0],
      appVersion: '2.2.0',
      botReady: true,
      botTag: 'PHONIX#0001',
      queue: {
        active: false,
        currentTrackTitle: null,
        queuedTrackCount: 0,
        liveVolume: null,
        repeatMode: null,
        autoplayEnabled: false,
        voiceChannelId: null,
        voiceChannelName: null,
        textChannelId: 'text-1',
        textChannelName: 'geral',
        bitrateKbps: null,
      },
      playback: {
        youtube: {
          requestedProfile: 'compatibility',
          effectiveProfile: 'compatibility',
          pipeline: 'youtube-dl',
          client: 'ANDROID',
          highWaterMark: null,
          cookieConfigured: false,
          downgradeReason: null,
          routeKind: 'native',
          bridgeMode: null,
        },
        spotify: {
          enabled: true,
          pipeline: 'spotify-bridge',
          routeKind: 'bridge',
        },
      },
      recovery: {
        ...createSessionDiagnostics({
          state: 'pending',
          health: 'recoverable',
          healthDetail: 'Sessao persistida pronta para recover com 3 faixa(s).',
          hasPersistedSession: true,
          itemCount: 3,
          recoveryReady: true,
          updatedAt: new Date('2026-04-05T00:00:00.000Z'),
          voiceChannelId: 'voice-1',
          textChannelId: 'text-1',
          lastSyncReason: 'recover',
          lastRecoveryTrigger: 'manual',
          lastRecoveryStatus: 'idle',
        }),
      },
      persistedSession: {
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        voiceChannelName: 'Music',
        textChannelId: 'text-1',
        textChannelName: 'geral',
        currentTrackTitle: 'Orbit',
        itemCount: 3,
        volume: 70,
        repeatMode: 0,
        autoplayEnabled: false,
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
    }),
    getDoctor: vi.fn().mockResolvedValue({
      guild: guilds[0],
      report: {
        appVersion: '2.2.0',
        overallStatus: 'ok',
        summary: { ok: 5, warning: 0, error: 0 },
        slashScope: 'global',
        dashboard: {
          requestedEnabled: true,
          effectiveEnabled: true,
          port: 3000,
          baseUrl: 'http://localhost:3000',
          disableReason: null,
        },
        checks: [],
        nextActions: [],
      },
    }),
    getIncidents: vi.fn().mockResolvedValue({
      guild: guilds[0],
      incidents: [],
    }),
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        prefix: '!',
        defaultVolume: 70,
        autoplayEnabled: false,
        resumeQueueEnabled: true,
      },
      sessionDiagnostics: createSessionDiagnostics({
        state: 'pending',
        health: 'recoverable',
        healthDetail: 'Sessao persistida pronta para recover com 3 faixa(s).',
        hasPersistedSession: true,
        itemCount: 3,
        recoveryReady: true,
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        lastSyncReason: 'recover',
        lastRecoveryTrigger: 'manual',
        lastRecoveryStatus: 'idle',
      }),
      liveVolume: null,
    }),
    getSession: vi.fn().mockResolvedValue({
      guild: guilds[0],
      diagnostics: createSessionDiagnostics({
        state: 'pending',
        health: 'recoverable',
        healthDetail: 'Sessao persistida pronta para recover com 3 faixa(s).',
        hasPersistedSession: true,
        itemCount: 3,
        recoveryReady: true,
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        lastSyncReason: 'recover',
        lastRecoveryTrigger: 'manual',
        lastRecoveryStatus: 'idle',
      }),
      persistedSession: {
        guildId: 'guild-1',
        voiceChannelId: 'voice-1',
        voiceChannelName: 'Music',
        textChannelId: 'text-1',
        textChannelName: 'geral',
        currentTrackTitle: 'Orbit',
        itemCount: 3,
        volume: 70,
        repeatMode: 0,
        autoplayEnabled: false,
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
      },
      activeQueue: {
        active: false,
        currentTrackTitle: null,
        queuedTrackCount: 0,
        liveVolume: null,
        repeatMode: null,
        autoplayEnabled: false,
        voiceChannelId: null,
        voiceChannelName: null,
        textChannelId: 'text-1',
        textChannelName: 'geral',
        bitrateKbps: null,
      },
    }),
    updateSettings: vi.fn().mockResolvedValue({
      settings: {
        prefix: '?',
        defaultVolume: 88,
        autoplayEnabled: true,
        resumeQueueEnabled: true,
      },
      sessionDiagnostics: createSessionDiagnostics({
        state: 'pending',
        health: 'recoverable',
        healthDetail: 'Sessao persistida pronta para recover com 3 faixa(s).',
        hasPersistedSession: true,
        itemCount: 3,
        recoveryReady: true,
        updatedAt: new Date('2026-04-05T00:00:00.000Z'),
        voiceChannelId: 'voice-1',
        textChannelId: 'text-1',
        lastSyncReason: 'recover',
        lastRecoveryTrigger: 'manual',
        lastRecoveryStatus: 'idle',
      }),
      liveVolume: 88,
    }),
    recover: vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'success',
      title: 'recover',
      description: 'ok',
    }),
    stop: vi.fn().mockResolvedValue({
      kind: 'notice',
      variant: 'success',
      title: 'stop',
      description: 'ok',
    }),
  };
}

function createConfig(): AppConfig {
  return {
    appVersion: '2.2.0',
    discordToken: 'token',
    discordClientId: 'client-id',
    databaseUrl: 'file:./data/test.db',
    prefix: '!',
    ffmpegPath: 'ffmpeg',
    spotify: {
      clientId: '',
      clientSecret: '',
      enabled: false,
    },
    dashboard: {
      enabled: true,
      baseUrl: 'http://localhost:3000',
      port: 3000,
      sessionSecret: 'dashboard-secret',
      discordClientSecret: 'discord-secret',
    },
  };
}

function createResolvedDashboardConfig(): ResolvedDashboardConfig {
  return {
    requestedEnabled: true,
    effectiveEnabled: true,
    baseUrl: 'http://localhost:3000',
    port: 3000,
    sessionSecret: 'dashboard-secret',
    discordClientSecret: 'discord-secret',
    disableReason: null,
  };
}

function parseCookies(setCookieHeader: string[] | string | undefined) {
  const cookies: Record<string, string> = {};
  const values = Array.isArray(setCookieHeader) ? setCookieHeader : setCookieHeader ? [setCookieHeader] : [];

  for (const cookie of values) {
    const [pair] = cookie.split(';');
    const [name, value] = pair.split('=');
    cookies[name] = value;
  }

  return cookies;
}

function toCookieHeader(setCookieHeader: string[] | string | undefined) {
  const cookies = parseCookies(setCookieHeader);
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
