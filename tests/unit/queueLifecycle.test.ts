import { describe, expect, it, vi } from 'vitest';
import { tryDeleteGuildQueue } from '../../src/modules/music/queueLifecycle.js';

describe('queue lifecycle guards', () => {
  it('does not attempt to delete a queue that was already marked as deleted', () => {
    const deleteQueue = vi.fn();

    expect(
      tryDeleteGuildQueue({
        deleted: true,
        delete: deleteQueue,
      } as never),
    ).toBe(false);
    expect(deleteQueue).not.toHaveBeenCalled();
  });

  it('ignores missing queue races when discord-player already removed the queue', () => {
    const deleteQueue = vi.fn().mockImplementation(() => {
      throw Object.assign(new Error('Cannot delete non-existing queue'), {
        code: 'ERR_NO_GUILD_QUEUE',
      });
    });

    expect(
      tryDeleteGuildQueue({
        deleted: false,
        delete: deleteQueue,
      } as never),
    ).toBe(false);
    expect(deleteQueue).toHaveBeenCalledTimes(1);
  });
});
