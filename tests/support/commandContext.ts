import { vi } from 'vitest';

export function createCommandContext(overrides: Record<string, unknown> = {}) {
  return {
    guild: { id: 'guild-1' },
    member: {},
    user: { id: 'user-1' },
    metadata: { textChannelId: 'text-1' },
    source: 'slash',
    queue: null,
    hasAdministrativeControl: () => false,
    signalTyping: vi.fn().mockResolvedValue(undefined),
    defer: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    replyError: vi.fn().mockResolvedValue(undefined),
    services: {
      useCases: {},
    },
    ...overrides,
  } as never;
}
