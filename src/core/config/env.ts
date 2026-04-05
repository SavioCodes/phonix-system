import { z } from 'zod';
import { APP_VERSION } from './version.js';

export type YouTubePlaybackProfile = 'compatibility' | 'fidelity';
export type YouTubeStreamClient = 'ANDROID' | 'WEB' | 'IOS' | 'TV_EMBEDDED';

export interface YouTubeConfig {
  profile?: YouTubePlaybackProfile;
  streamClient?: YouTubeStreamClient;
  cookie?: string;
  highWaterMark?: number;
}

export interface DashboardConfig {
  enabled: boolean;
  baseUrl?: string;
  port: number;
  sessionSecret?: string;
  discordClientSecret?: string;
}

export interface ResolvedDashboardConfig {
  requestedEnabled: boolean;
  effectiveEnabled: boolean;
  baseUrl: string | null;
  port: number;
  sessionSecret: string | null;
  discordClientSecret: string | null;
  disableReason: string | null;
}

export interface AppConfig {
  appVersion?: string;
  discordToken: string;
  discordClientId: string;
  discordGuildId?: string;
  databaseUrl: string;
  prefix: string;
  ffmpegPath: string;
  spotify: {
    clientId: string;
    clientSecret: string;
    enabled: boolean;
  };
  youtube?: YouTubeConfig;
  dashboard?: DashboardConfig;
}

const optionalNonEmptyString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().min(1).optional());

const optionalYoutubeProfile = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed === '' ? undefined : trimmed;
}, z.enum(['compatibility', 'fidelity']).optional());

const optionalYoutubeStreamClient = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim().toUpperCase();
  return trimmed === '' ? undefined : trimmed;
}, z.enum(['ANDROID', 'WEB', 'IOS', 'TV_EMBEDDED']).optional());

const optionalPositiveInteger = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(65_536).max(8_388_608).optional());

const dashboardEnabledSchema = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') {
    return false;
  }

  if (['1', 'true', 'yes', 'on'].includes(trimmed)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(trimmed)) {
    return false;
  }

  return value;
}, z.boolean().default(false));

const optionalUrlString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}, z.string().url().optional());

const dashboardPortSchema = z.preprocess((value) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : value;
}, z.number().int().min(1).max(65_535).default(3000));

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1, 'DISCORD_TOKEN is required'),
  DISCORD_CLIENT_ID: z.string().min(1, 'DISCORD_CLIENT_ID is required'),
  DISCORD_CLIENT_SECRET: optionalNonEmptyString,
  DISCORD_GUILD_ID: optionalNonEmptyString,
  DATABASE_URL: z.string().default('file:./data/phonix.db'),
  BOT_PREFIX: z.string().min(1).max(5).default('!'),
  SPOTIFY_CLIENT_ID: optionalNonEmptyString,
  SPOTIFY_CLIENT_SECRET: optionalNonEmptyString,
  FFMPEG_PATH: optionalNonEmptyString,
  YOUTUBE_PLAYBACK_PROFILE: optionalYoutubeProfile,
  YOUTUBE_STREAM_CLIENT: optionalYoutubeStreamClient,
  YOUTUBE_COOKIE: optionalNonEmptyString,
  YOUTUBE_HIGH_WATER_MARK: optionalPositiveInteger,
  DASHBOARD_ENABLED: dashboardEnabledSchema,
  DASHBOARD_BASE_URL: optionalUrlString,
  DASHBOARD_PORT: dashboardPortSchema,
  DASHBOARD_SESSION_SECRET: optionalNonEmptyString,
});

export function parseConfig(env: NodeJS.ProcessEnv): AppConfig {
  const parsed = envSchema.parse(env);
  const spotifyConfigured = Boolean(parsed.SPOTIFY_CLIENT_ID && parsed.SPOTIFY_CLIENT_SECRET);

  return {
    appVersion: APP_VERSION,
    discordToken: parsed.DISCORD_TOKEN,
    discordClientId: parsed.DISCORD_CLIENT_ID,
    discordGuildId: parsed.DISCORD_GUILD_ID,
    databaseUrl: parsed.DATABASE_URL,
    prefix: parsed.BOT_PREFIX,
    ffmpegPath: parsed.FFMPEG_PATH?.trim() || 'ffmpeg',
    spotify: {
      clientId: parsed.SPOTIFY_CLIENT_ID ?? '',
      clientSecret: parsed.SPOTIFY_CLIENT_SECRET ?? '',
      enabled: spotifyConfigured,
    },
    youtube: {
      profile: parsed.YOUTUBE_PLAYBACK_PROFILE ?? 'compatibility',
      streamClient: parsed.YOUTUBE_STREAM_CLIENT,
      cookie: parsed.YOUTUBE_COOKIE,
      highWaterMark: parsed.YOUTUBE_HIGH_WATER_MARK,
    },
    dashboard: {
      enabled: parsed.DASHBOARD_ENABLED,
      baseUrl: normalizeBaseUrl(parsed.DASHBOARD_BASE_URL),
      port: parsed.DASHBOARD_PORT,
      sessionSecret: parsed.DASHBOARD_SESSION_SECRET,
      discordClientSecret: parsed.DISCORD_CLIENT_SECRET,
    },
  };
}

export function resolveDashboardConfig(dashboard?: DashboardConfig): ResolvedDashboardConfig {
  const requestedEnabled = dashboard?.enabled ?? false;
  const baseUrl = dashboard?.baseUrl?.trim() ? normalizeBaseUrl(dashboard.baseUrl) : null;
  const sessionSecret = dashboard?.sessionSecret?.trim() ? dashboard.sessionSecret.trim() : null;
  const discordClientSecret = dashboard?.discordClientSecret?.trim() ? dashboard.discordClientSecret.trim() : null;
  const port = dashboard?.port ?? 3000;

  if (!requestedEnabled) {
    return {
      requestedEnabled,
      effectiveEnabled: false,
      baseUrl: baseUrl ?? null,
      port,
      sessionSecret: sessionSecret ?? null,
      discordClientSecret: discordClientSecret ?? null,
      disableReason: null,
    };
  }

  const missing: string[] = [];

  if (!baseUrl) {
    missing.push('DASHBOARD_BASE_URL');
  }

  if (!sessionSecret) {
    missing.push('DASHBOARD_SESSION_SECRET');
  }

  if (!discordClientSecret) {
    missing.push('DISCORD_CLIENT_SECRET');
  }

  return {
    requestedEnabled,
    effectiveEnabled: missing.length === 0,
    baseUrl: baseUrl ?? null,
    port,
    sessionSecret: sessionSecret ?? null,
    discordClientSecret: discordClientSecret ?? null,
    disableReason:
      missing.length > 0
        ? `Dashboard solicitado, mas faltam configuracoes obrigatorias: ${missing.join(', ')}.`
        : null,
  };
}

function normalizeBaseUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  return value.replace(/\/+$/u, '');
}
