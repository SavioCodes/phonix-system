import type { OperationalIncident } from '../diagnostics/services/operationalTelemetryService.js';
import type { DoctorReport } from '../diagnostics/services/doctorService.js';
import type { StoredPlaybackSession } from '../library/services/playbackSessionsService.js';
import type { GuildConfigResult, NoticeView } from '../ui/view-models.js';
import type { PlaybackSessionDiagnostics } from '../music/playbackSessionManager.js';

export interface DashboardSessionRecord {
  id: string;
  discordUserId: string;
  username: string;
  avatar: string | null;
  authorizedGuildIds: string[];
  csrfTokenHash: string;
  oauthAccessToken: string | null;
  oauthRefreshToken: string | null;
  oauthTokenType: string | null;
  oauthScope: string | null;
  oauthExpiresAt: Date | null;
  lastAuthorizedSyncAt: Date | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardViewer {
  id: string;
  username: string;
  avatarUrl: string | null;
}

export interface DashboardGuildSummary {
  id: string;
  name: string;
  iconUrl: string | null;
}

export interface DashboardQueueSummary {
  active: boolean;
  currentTrackTitle: string | null;
  queuedTrackCount: number;
  liveVolume: number | null;
  repeatMode: string | null;
  autoplayEnabled: boolean;
  voiceChannelId: string | null;
  voiceChannelName: string | null;
  textChannelId: string | null;
  textChannelName: string | null;
  bitrateKbps: number | null;
}

export interface DashboardPersistedSessionSummary {
  guildId: string;
  voiceChannelId: string;
  voiceChannelName: string | null;
  textChannelId: string;
  textChannelName: string | null;
  currentTrackTitle: string | null;
  itemCount: number;
  volume: number;
  repeatMode: number;
  autoplayEnabled: boolean;
  updatedAt: Date;
}

export interface DashboardOverviewView {
  guild: DashboardGuildSummary;
  appVersion: string;
  botReady: boolean;
  botTag: string | null;
  queue: DashboardQueueSummary;
  playback: {
    youtube: {
      requestedProfile: string;
      effectiveProfile: string;
      pipeline: string;
      client: string;
      highWaterMark: number | null;
      cookieConfigured: boolean;
      generateWithPoToken: boolean;
      downgradeReason: string | null;
      routeKind: string;
      bridgeMode: string | null;
    };
    spotify: {
      enabled: boolean;
      pipeline: string;
      routeKind: string;
    };
  };
  recovery: PlaybackSessionDiagnostics;
  persistedSession: DashboardPersistedSessionSummary | null;
}

export interface DashboardSessionView {
  guild: DashboardGuildSummary;
  diagnostics: PlaybackSessionDiagnostics;
  persistedSession: DashboardPersistedSessionSummary | null;
  activeQueue: DashboardQueueSummary;
}

export interface DashboardDoctorView {
  guild: DashboardGuildSummary;
  report: DoctorReport;
}

export interface DashboardIncidentsView {
  guild: DashboardGuildSummary;
  incidents: OperationalIncident[];
}

export interface DashboardSettingsPatch {
  prefix?: string;
  defaultVolume?: number;
  autoplayEnabled?: boolean;
  resumeQueueEnabled?: boolean;
}

export type DashboardMutationResult = NoticeView;

export interface DashboardGuildSnapshot {
  guild: DashboardGuildSummary;
  settings: GuildConfigResult;
  diagnostics: PlaybackSessionDiagnostics;
  persistedSession: StoredPlaybackSession | null;
}
