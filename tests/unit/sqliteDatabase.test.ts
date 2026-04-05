import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeSqliteDatabaseUrl, prepareSqliteDatabase } from '../../src/core/database/sqlite.js';
import {
  cleanupSqliteTestDatabase,
  createPreparedSqliteTestDatabase,
  createTempTestDirectory,
} from '../support/sqliteTestHarness.js';

describe('sqlite database bootstrap', () => {
  let tempDir: string | undefined;
  let prisma: PrismaClient | undefined;

  afterEach(async () => {
    await cleanupSqliteTestDatabase(prisma, tempDir);
    prisma = undefined;
    tempDir = undefined;
  });

  it('normalizes relative sqlite urls into absolute urls', () => {
    const url = normalizeSqliteDatabaseUrl('file:./data/phonix.db');
    expect(url.startsWith('file:')).toBe(true);
    expect(url).toContain('/data/phonix.db');
  });

  it('creates and initializes an empty sqlite database from migrations', async () => {
    const database = await createPreparedSqliteTestDatabase('phonix-sqlite-', 'phonix.db');
    tempDir = database.tempDir;
    prisma = database.prismaClient;

    const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN ('GuildSettings', 'UserFavorite', 'Playlist', 'PlaylistItem', 'TrackHistory', 'GuildPlaybackSession', 'GuildPlaybackSessionItem', 'OperationalIncident', 'DashboardSession', '_phonix_migrations')
      ORDER BY name
    `);

    expect(tables.map((table) => table.name)).toEqual([
      'DashboardSession',
      'GuildPlaybackSession',
      'GuildPlaybackSessionItem',
      'GuildSettings',
      'OperationalIncident',
      'Playlist',
      'PlaylistItem',
      'TrackHistory',
      'UserFavorite',
      '_phonix_migrations',
    ]);
  }, 15_000);

  it('baselines old databases and applies only the missing migrations', async () => {
    tempDir = createTempTestDirectory('phonix-sqlite-upgrade-');
    const dbUrl = `file:${path.join(tempDir, 'phonix.db').replaceAll('\\', '/')}`;

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });

    await prisma.$connect();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "GuildSettings" (
        "guildId" TEXT NOT NULL PRIMARY KEY,
        "prefix" TEXT NOT NULL DEFAULT '!',
        "defaultVolume" INTEGER NOT NULL DEFAULT 70,
        "autoplayEnabled" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE TABLE "UserFavorite" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "author" TEXT NOT NULL, "thumbnail" TEXT NOT NULL, "duration" TEXT NOT NULL, "source" TEXT NOT NULL, "encodedTrack" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "Playlist" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "PlaylistItem" ("id" TEXT NOT NULL PRIMARY KEY, "playlistId" TEXT NOT NULL, "position" INTEGER NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "author" TEXT NOT NULL, "thumbnail" TEXT NOT NULL, "duration" TEXT NOT NULL, "source" TEXT NOT NULL, "encodedTrack" TEXT NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    await prisma.$executeRawUnsafe(`CREATE TABLE "TrackHistory" ("id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "guildId" TEXT NOT NULL, "title" TEXT NOT NULL, "url" TEXT NOT NULL, "author" TEXT NOT NULL, "thumbnail" TEXT NOT NULL, "duration" TEXT NOT NULL, "source" TEXT NOT NULL, "playedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`);

    await prepareSqliteDatabase(prisma, dbUrl);

    const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info("GuildSettings") ORDER BY cid ASC`,
    );
    expect(columns.some((column) => column.name === 'resumeQueueEnabled')).toBe(true);

    const dashboardSessionColumns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT name FROM pragma_table_info("DashboardSession") ORDER BY cid ASC`,
    );
    expect(dashboardSessionColumns.map((column) => column.name)).toEqual([
      'id',
      'discordUserId',
      'username',
      'avatar',
      'authorizedGuildIdsJson',
      'csrfTokenHash',
      'expiresAt',
      'createdAt',
      'updatedAt',
      'oauthAccessTokenCiphertext',
      'oauthRefreshTokenCiphertext',
      'oauthTokenType',
      'oauthScope',
      'oauthExpiresAt',
      'lastAuthorizedSyncAt',
    ]);

    const appliedMigrations = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM "_phonix_migrations" ORDER BY "name" ASC`,
    );
    expect(appliedMigrations.map((migration) => migration.name)).toEqual([
      '20260402125500_init',
      '20260402201500_playback_sessions',
      '20260402224500_operational_incidents',
      '20260405143000_dashboard_sessions',
      '20260405190000_dashboard_session_oauth_refresh',
    ]);
  }, 20_000);
});
