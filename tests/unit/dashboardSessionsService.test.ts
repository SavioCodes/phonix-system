import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { DashboardSessionsService } from '../../src/modules/dashboard/services/dashboardSessionsService.js';
import { cleanupSqliteTestDatabase, createPreparedSqliteTestDatabase } from '../support/sqliteTestHarness.js';
let tempDir: string | undefined;

describe('dashboard sessions service', () => {
  let prisma: PrismaClient | undefined;

  afterEach(async () => {
    await cleanupSqliteTestDatabase(prisma, tempDir);
    prisma = undefined;
    tempDir = undefined;
  });

  it('stores OAuth material encrypted at rest and exposes a decrypted session record', async () => {
    const { databaseUrl, prismaClient } = await createTestDatabase();
    prisma = prismaClient;

    const service = new DashboardSessionsService(prisma, 'dashboard-secret');
    const session = await service.create({
      discordUserId: 'user-1',
      username: 'Phonix Admin',
      authorizedGuildIds: ['guild-2', 'guild-1'],
      csrfToken: 'csrf-token',
      oauth: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresAt: new Date('2026-04-05T12:00:00.000Z'),
      },
    });

    const stored = await prisma.dashboardSession.findUnique({
      where: { id: session.id },
    });

    expect(databaseUrl.startsWith('file:')).toBe(true);
    expect(stored?.oauthAccessTokenCiphertext).toBeTruthy();
    expect(stored?.oauthAccessTokenCiphertext).not.toContain('access-token');
    expect(stored?.oauthRefreshTokenCiphertext).toBeTruthy();
    expect(stored?.oauthRefreshTokenCiphertext).not.toContain('refresh-token');

    const reloaded = await service.get(session.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.authorizedGuildIds).toEqual(['guild-1', 'guild-2']);
    expect(reloaded?.oauthAccessToken).toBe('access-token');
    expect(reloaded?.oauthRefreshToken).toBe('refresh-token');
    expect(reloaded?.oauthTokenType).toBe('Bearer');
    expect(reloaded?.oauthScope).toBe('identify guilds');
    expect(reloaded?.lastAuthorizedSyncAt).not.toBeNull();
  });

  it('updates authorization data and prunes expired dashboard sessions', async () => {
    const { prismaClient } = await createTestDatabase();
    prisma = prismaClient;

    const service = new DashboardSessionsService(prisma, 'dashboard-secret');
    const session = await service.create({
      discordUserId: 'user-1',
      username: 'Phonix Admin',
      authorizedGuildIds: ['guild-1'],
      csrfToken: 'csrf-token',
      oauth: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresAt: new Date('2026-04-05T12:00:00.000Z'),
      },
    });

    const syncAt = new Date('2026-04-05T13:00:00.000Z');
    const updated = await service.update(session.id, {
      authorizedGuildIds: ['guild-3'],
      oauth: {
        accessToken: 'access-token-2',
        refreshToken: 'refresh-token-2',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresAt: new Date('2026-04-05T14:00:00.000Z'),
      },
      lastAuthorizedSyncAt: syncAt,
    });

    expect(updated?.authorizedGuildIds).toEqual(['guild-3']);
    expect(updated?.oauthAccessToken).toBe('access-token-2');
    expect(updated?.oauthRefreshToken).toBe('refresh-token-2');
    expect(updated?.lastAuthorizedSyncAt).toEqual(syncAt);

    await service.create({
      discordUserId: 'user-2',
      username: 'Expired',
      authorizedGuildIds: ['guild-9'],
      csrfToken: 'csrf-expired',
      oauth: {
        accessToken: 'expired-access',
        refreshToken: 'expired-refresh',
        tokenType: 'Bearer',
        scope: 'identify guilds',
        expiresAt: new Date('2026-04-05T12:00:00.000Z'),
      },
      expiresAt: new Date(Date.now() - 60_000),
    });

    await service.pruneExpired();

    const sessions = await prisma.dashboardSession.findMany({
      orderBy: { discordUserId: 'asc' },
    });

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.discordUserId).toBe('user-1');
  });
});

async function createTestDatabase() {
  const database = await createPreparedSqliteTestDatabase('phonix-dashboard-session-');
  tempDir = database.tempDir;

  return {
    databaseUrl: database.databaseUrl,
    prismaClient: database.prismaClient,
  };
}
