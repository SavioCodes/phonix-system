import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../src/core/config/env.js';
import {
  buildPlaybackVerificationChecklist,
  buildPlaybackVerificationMatrix,
  formatPlaybackVerificationTable,
} from '../../src/scripts/support/playbackVerification.js';

describe('playback verification helpers', () => {
  it('downgrades fidelity rows when cookie is missing', () => {
    const matrix = buildPlaybackVerificationMatrix(createConfig());
    const fidelity64 = matrix.find((row) => row.requestedProfile === 'fidelity' && row.bitrateKbps === 64);

    expect(fidelity64).toBeDefined();
    expect(fidelity64?.effectiveProfile).toBe('compatibility');
    expect(fidelity64?.ready).toBe(false);
    expect(fidelity64?.blockingReason).toContain('YOUTUBE_COOKIE');
  });

  it('keeps fidelity rows ready when cookie is configured', () => {
    const matrix = buildPlaybackVerificationMatrix(
      createConfig({
        youtube: {
          profile: 'compatibility',
          cookie: 'SID=abc',
        },
      }),
    );
    const fidelity128 = matrix.find((row) => row.requestedProfile === 'fidelity' && row.bitrateKbps === 128);

    expect(fidelity128).toBeDefined();
    expect(fidelity128?.effectiveProfile).toBe('fidelity');
    expect(fidelity128?.pipeline).toBe('youtubei');
    expect(fidelity128?.ready).toBe(true);
  });

  it('formats the verification table and checklist for the runbook/script', () => {
    const matrix = buildPlaybackVerificationMatrix(createConfig(), [64]);
    const formatted = formatPlaybackVerificationTable(matrix);
    const checklist = buildPlaybackVerificationChecklist();

    expect(formatted).toContain('Bitrate');
    expect(formatted).toContain('64 kbps');
    expect(formatted).toContain('compatibility');
    expect(checklist.some((item) => item.includes('Spotify hoje funciona por bridge'))).toBe(true);
  });
});

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    discordToken: 'token',
    discordClientId: 'client-1',
    discordGuildId: 'guild-1',
    databaseUrl: 'file:./data/test.db',
    prefix: '!',
    ffmpegPath: 'ffmpeg',
    spotify: {
      clientId: '',
      clientSecret: '',
      enabled: false,
    },
    youtube: {
      profile: 'compatibility',
    },
    ...overrides,
  };
}
