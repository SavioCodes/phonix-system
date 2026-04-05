import type { PlaybackSessionDiagnostics } from '../../src/modules/music/playbackSessionManager.js';

export function createSessionDiagnostics(
  overrides: Partial<PlaybackSessionDiagnostics> = {},
): PlaybackSessionDiagnostics {
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
    ...overrides,
  };
}
