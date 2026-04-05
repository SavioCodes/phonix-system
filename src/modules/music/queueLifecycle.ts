import type { GuildQueue } from 'discord-player';

export function tryDeleteGuildQueue<TMetadata>(queue: Pick<GuildQueue<TMetadata>, 'delete' | 'deleted'>) {
  if (queue.deleted) {
    return false;
  }

  try {
    queue.delete();
    return true;
  } catch (error) {
    if (isMissingGuildQueueError(error)) {
      return false;
    }

    throw error;
  }
}

export function isMissingGuildQueueError(error: unknown) {
  return (
    error instanceof Error &&
    (((error as { code?: string }).code ?? null) === 'ERR_NO_GUILD_QUEUE' ||
      /cannot delete non-existing queue/iu.test(error.message))
  );
}
