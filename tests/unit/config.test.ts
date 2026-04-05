import { describe, expect, it } from 'vitest';
import { parseConfig, resolveDashboardConfig } from '../../src/core/config/env.js';

describe('config parser', () => {
  it('applies defaults and detects spotify status', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
    });

    expect(config.prefix).toBe('!');
    expect(config.databaseUrl).toBe('file:./data/phonix.db');
    expect(config.spotify.enabled).toBe(false);
    expect(config.youtube?.profile).toBe('compatibility');
    expect(config.youtube?.streamClient).toBeUndefined();
    expect(config.youtube?.highWaterMark).toBeUndefined();
    expect(config.appVersion).toBe('2.1.0');
    expect(config.dashboard?.enabled).toBe(false);
    expect(config.dashboard?.port).toBe(3000);
  });

  it('treats empty optional values as unset', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      DISCORD_GUILD_ID: '   ',
      SPOTIFY_CLIENT_ID: '',
      SPOTIFY_CLIENT_SECRET: '',
      FFMPEG_PATH: '',
      YOUTUBE_COOKIE: '',
    });

    expect(config.discordGuildId).toBeUndefined();
    expect(config.spotify.enabled).toBe(false);
    expect(config.ffmpegPath).toBe('ffmpeg');
    expect(config.youtube?.cookie).toBeUndefined();
    expect(config.dashboard?.baseUrl).toBeUndefined();
    expect(config.dashboard?.sessionSecret).toBeUndefined();
  });

  it('enables spotify when credentials are present', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      SPOTIFY_CLIENT_ID: 'abc',
      SPOTIFY_CLIENT_SECRET: 'def',
    });

    expect(config.spotify.enabled).toBe(true);
  });

  it('parses youtube playback profile, client, cookie and highWaterMark', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      YOUTUBE_PLAYBACK_PROFILE: 'fidelity',
      YOUTUBE_STREAM_CLIENT: 'web',
      YOUTUBE_COOKIE: 'SID=abc;',
      YOUTUBE_HIGH_WATER_MARK: '1048576',
    });

    expect(config.youtube).toEqual({
      profile: 'fidelity',
      streamClient: 'WEB',
      cookie: 'SID=abc;',
      highWaterMark: 1048576,
    });
  });

  it('rejects unsupported youtube stream clients and invalid highWaterMark values', () => {
    expect(() =>
      parseConfig({
        DISCORD_TOKEN: 'token',
        DISCORD_CLIENT_ID: 'client',
        YOUTUBE_STREAM_CLIENT: 'DESKTOP',
      }),
    ).toThrow();

    expect(() =>
      parseConfig({
        DISCORD_TOKEN: 'token',
        DISCORD_CLIENT_ID: 'client',
        YOUTUBE_HIGH_WATER_MARK: '1024',
      }),
    ).toThrow();
  });

  it('parses dashboard env vars and resolves an effective admin center runtime only with the required config', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      DISCORD_CLIENT_SECRET: 'secret',
      DASHBOARD_ENABLED: 'true',
      DASHBOARD_BASE_URL: 'https://phonix.local/dashboard/',
      DASHBOARD_PORT: '4100',
      DASHBOARD_SESSION_SECRET: 'dashboard-secret',
    });

    expect(config.dashboard).toEqual({
      enabled: true,
      baseUrl: 'https://phonix.local/dashboard',
      port: 4100,
      sessionSecret: 'dashboard-secret',
      discordClientSecret: 'secret',
    });

    expect(resolveDashboardConfig(config.dashboard)).toEqual({
      requestedEnabled: true,
      effectiveEnabled: true,
      baseUrl: 'https://phonix.local/dashboard',
      port: 4100,
      sessionSecret: 'dashboard-secret',
      discordClientSecret: 'secret',
      disableReason: null,
    });
  });

  it('keeps the bot bootable when the dashboard is requested but missing required env vars', () => {
    const config = parseConfig({
      DISCORD_TOKEN: 'token',
      DISCORD_CLIENT_ID: 'client',
      DASHBOARD_ENABLED: 'true',
    });

    expect(resolveDashboardConfig(config.dashboard)).toEqual({
      requestedEnabled: true,
      effectiveEnabled: false,
      baseUrl: null,
      port: 3000,
      sessionSecret: null,
      discordClientSecret: null,
      disableReason: 'Dashboard solicitado, mas faltam configuracoes obrigatorias: DASHBOARD_BASE_URL, DASHBOARD_SESSION_SECRET, DISCORD_CLIENT_SECRET.',
    });
  });
});
