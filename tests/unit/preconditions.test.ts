import { describe, expect, it } from 'vitest';
import {
  requireActiveQueue,
  requireAdministrator,
  requireAudioPlayback,
  requireOwner,
  resolveTrackForLibraryInput,
} from '../../src/modules/commands/preconditions.js';
import {
  AuthorizationCommandError,
  DependencyCommandError,
  PreconditionCommandError,
} from '../../src/modules/commands/errors.js';

describe('command preconditions', () => {
  it('throws a dependency error when ffmpeg is unavailable', () => {
    expect(() =>
      requireAudioPlayback({
        services: {
          ffmpeg: {
            available: false,
            executable: 'ffmpeg',
            detail: 'not found',
          },
        },
      } as never),
    ).toThrowError(DependencyCommandError);
  });

  it('throws an authorization error for non-admin members', () => {
    expect(() =>
      requireAdministrator(
        {
          user: {
            id: 'user-1',
          },
          member: {
            permissions: {
              has: () => false,
            },
          },
        } as never,
        'config',
      ),
    ).toThrowError(AuthorizationCommandError);
  });

  it('allows the configured owner to pass the administrative guard even without guild admin permission', () => {
    expect(() =>
      requireAdministrator(
        {
          user: {
            id: '976586934455513159',
          },
          member: {
            permissions: {
              has: () => false,
            },
          },
        } as never,
        'config',
      ),
    ).not.toThrow();
  });

  it('blocks non-owners from the explicit owner-only guard', () => {
    expect(() =>
      requireOwner(
        {
          user: {
            id: 'user-2',
          },
        } as never,
        'owner',
      ),
    ).toThrowError(AuthorizationCommandError);
  });

  it('throws a precondition error when there is no active queue', () => {
    expect(() =>
      requireActiveQueue({
        queue: null,
      } as never),
    ).toThrowError(PreconditionCommandError);
  });

  it('keeps the library-specific message when there is no current track to save', async () => {
    await expect(
      resolveTrackForLibraryInput(
        {
          queue: null,
        } as never,
        undefined,
      ),
    ).rejects.toThrow('Nada tocando agora. Informe uma busca ou URL para salvar.');
  });
});
