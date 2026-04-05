import type { DoctorReport } from '../diagnostics/services/doctorService.js';
import type { PlaybackSessionDiagnostics } from '../music/playbackSessionManager.js';

export interface TrackCardView {
  title: string;
  author: string;
  duration: string;
  thumbnail: string;
  url?: string | null;
  sourceLabel?: string | null;
}

export interface QueueEntryView {
  position: number;
  title: string;
  duration: string;
}

export interface NoticeFieldView {
  name: string;
  value: string;
  inline?: boolean;
}

export interface NoticeView {
  kind: 'notice';
  variant: 'success' | 'info' | 'warning' | 'error';
  title: string;
  description: string;
  fields?: NoticeFieldView[];
  hint?: string | null;
}

export interface TrackNoticeView {
  kind: 'track';
  title: string;
  description: string;
  track: TrackCardView;
  fields?: NoticeFieldView[];
  hint?: string | null;
}

export type PlayMode = 'queue' | 'next' | 'replace';
export type PlaySource = 'auto' | 'youtube' | 'spotify';
export type PlaySourceLabel = 'Auto' | 'YouTube' | 'Spotify';

export interface PlayResultView {
  kind: 'play';
  title: string;
  description: string;
  track: TrackCardView;
  resultType: 'track' | 'playlist';
  mode: PlayMode;
  source: PlaySourceLabel;
  startedPlayback: boolean;
  addedCount: number;
  requestedCount: number;
  truncatedCount: number;
  queuePosition: number | null;
  estimatedWait: string | null;
  voiceChannelName: string | null;
  autoplayEnabled: boolean;
  sourceRouteKind?: 'native' | 'bridge' | 'unknown';
  sourceDetail?: string | null;
  entry: {
    connection: string;
    session: string;
    startup: string;
    runtime: string | null;
  };
  hint: string | null;
}

export interface SessionStatusView {
  stateLabel: string;
  healthLabel: string;
  summary: string;
  persistedItemCount: number;
  liveItemCount: number;
  recoveryReady: boolean;
  manualInterventionRequired: boolean;
  lastRecoveryLabel: string;
  lastRecoverySummary: string;
  currentRouteLabel: string | null;
}

export interface QueueView {
  kind: 'queue';
  title: string;
  description: string;
  currentTrack: TrackCardView | null;
  currentProgressBar: string | null;
  upcomingTracks: QueueEntryView[];
  size: number;
  durationFormatted: string;
  hiddenTrackCount: number;
  volume: number;
  voiceChannelName: string | null;
  repeatModeLabel: string;
  autoplayEnabled: boolean;
  session: SessionStatusView;
}

export interface NowPlayingView {
  kind: 'nowPlaying';
  title: string;
  description: string;
  track: TrackCardView | null;
  progressBar: string | null;
  volume: number;
  voiceChannelName: string | null;
  queueSize: number;
  durationFormatted: string;
  repeatModeLabel: string;
  autoplayEnabled: boolean;
  nextTrack: QueueEntryView | null;
  session: SessionStatusView;
}

export type CommandView = NoticeView | TrackNoticeView | PlayResultView | QueueView | NowPlayingView;

export interface GuildSettingsView {
  prefix: string;
  defaultVolume: number;
  autoplayEnabled: boolean;
  resumeQueueEnabled: boolean;
}

export interface GuildConfigResult {
  settings: GuildSettingsView;
  sessionDiagnostics: PlaybackSessionDiagnostics;
  liveVolume: number | null;
}

export interface HelpResultView {
  prefix: string;
  currentPage: HelpPageId;
  navigation: HelpNavigationView;
  resumeQueueEnabled: boolean;
  hasActiveQueue: boolean;
  memberIsAdmin: boolean;
  memberIsOwner: boolean;
  pages: Record<HelpPageId, HelpPageView>;
  sessionDiagnostics: PlaybackSessionDiagnostics;
}

export type HelpPageId = 'home' | 'playback' | 'library' | 'recovery' | 'admin';

export interface HelpFieldView {
  name: string;
  value: string;
  inline?: boolean;
}

export interface HelpPageView {
  id: HelpPageId;
  label: string;
  title: string;
  description: string;
  fields: HelpFieldView[];
}

export interface HelpNavigationView {
  guildId: string;
  userId: string;
  currentPage: HelpPageId;
  prefix: string;
}

export type DoctorResultView = DoctorReport;
