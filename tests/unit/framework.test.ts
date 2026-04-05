import { describe, expect, it, vi, afterEach } from 'vitest';
import { logger } from '../../src/core/logging/logger.js';
import { CommandContext } from '../../src/modules/commands/framework.js';

describe('command framework interaction guards', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when a slash interaction can no longer be deferred', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const context = new CommandContext({
      client: {} as never,
      services: {} as never,
      guild: { id: 'guild-expired' } as never,
      member: {} as never,
      user: { id: 'user-expired' } as never,
      channelId: 'text-expired',
      source: 'slash',
      interaction: {
        deferred: false,
        replied: false,
        deferReply: vi.fn().mockRejectedValue(Object.assign(new Error('Unknown interaction'), { code: 10062 })),
      } as never,
    });

    await expect(context.defer()).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-expired',
        userId: 'user-expired',
        source: 'slash',
      }),
      'Slash interaction expired before PHONIX could acknowledge the command',
    );
  });

  it('suppresses expired interaction reply failures instead of throwing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const reply = vi.fn().mockRejectedValue(Object.assign(new Error('Unknown interaction'), { code: 10062 }));
    const context = new CommandContext({
      client: {} as never,
      services: {} as never,
      guild: { id: 'guild-reply' } as never,
      member: {} as never,
      user: { id: 'user-reply' } as never,
      channelId: 'text-reply',
      source: 'slash',
      interaction: {
        deferred: false,
        replied: false,
        reply,
      } as never,
    });

    await expect(context.reply({ content: 'ok' })).resolves.toBeUndefined();
    expect(reply).toHaveBeenCalledWith({ content: 'ok' });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-reply',
        userId: 'user-reply',
        source: 'slash',
      }),
      'PHONIX could not deliver the interaction response because the interaction was no longer valid',
    );
  });
});
