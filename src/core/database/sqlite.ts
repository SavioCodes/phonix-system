import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { logger } from '../logging/logger.js';

const SQLITE_PREFIX = 'file:';
const MIGRATIONS_TABLE = '_phonix_migrations';
let cachedMigrationDefinitions:
  | Array<{
      name: string;
      statements: string[];
    }>
  | null = null;

export async function prepareSqliteDatabase(prisma: PrismaClient, databaseUrl: string) {
  const normalizedUrl = normalizeSqliteDatabaseUrl(databaseUrl);
  const databasePath = ensureSqliteDatabaseDirectory(normalizedUrl);

  if (!databasePath) {
    return normalizedUrl;
  }

  await ensureMigrationsTable(prisma);
  await baselineLegacyMigrations(prisma);
  const appliedMigrations = await getAppliedMigrationNames(prisma);
  const pendingMigrations = getMigrationDefinitions().filter((migration) => !appliedMigrations.has(migration.name));

  for (const migration of pendingMigrations) {
    for (const statement of migration.statements) {
      await prisma.$executeRawUnsafe(statement);
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
      migration.name,
    );
  }

  if (pendingMigrations.length > 0) {
    logger.info(
      {
        databasePath,
        migrationsApplied: pendingMigrations.length,
        migrationNames: pendingMigrations.map((migration) => migration.name),
      },
      'SQLite database initialized from versioned migrations',
    );
  }

  return normalizedUrl;
}

export function normalizeSqliteDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl.startsWith(SQLITE_PREFIX)) {
    return databaseUrl;
  }

  const { pathname, suffix } = splitSqliteUrl(databaseUrl);
  if (!pathname || pathname === ':memory:') {
    return databaseUrl;
  }

  const absolutePath = path.isAbsolute(pathname) ? pathname : path.resolve(process.cwd(), pathname);
  return `${SQLITE_PREFIX}${absolutePath.replaceAll('\\', '/')}${suffix}`;
}

async function hasCoreAppSchema(prisma: PrismaClient) {
  const result = (await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(`
    SELECT COUNT(*) AS count
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN ('GuildSettings', 'UserFavorite', 'Playlist', 'PlaylistItem', 'TrackHistory')
  `)) ?? [{ count: 0 }];

  const count = Number(result[0]?.count ?? 0);
  return count === 5;
}

async function ensureMigrationsTable(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrationNames(prisma: PrismaClient) {
  const rows =
    (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `SELECT "name" FROM "${MIGRATIONS_TABLE}" ORDER BY "name" ASC`,
    )) ?? [];

  return new Set(rows.map((row) => row.name));
}

async function baselineLegacyMigrations(prisma: PrismaClient) {
  const applied = await getAppliedMigrationNames(prisma);
  if (applied.size > 0) {
    return;
  }

  const hasLegacySchema = await hasCoreAppSchema(prisma);
  if (!hasLegacySchema) {
    return;
  }

  await prisma.$executeRawUnsafe(
    `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
    '20260402125500_init',
  );

  if ((await hasTable(prisma, 'GuildPlaybackSession')) && (await hasTable(prisma, 'GuildPlaybackSessionItem')) && (await hasColumn(prisma, 'GuildSettings', 'resumeQueueEnabled'))) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
      '20260402201500_playback_sessions',
    );
  }

  if (await hasTable(prisma, 'OperationalIncident')) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
      '20260402224500_operational_incidents',
    );
  }

  if (await hasTable(prisma, 'DashboardSession')) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
      '20260405143000_dashboard_sessions',
    );
  }

  if (
    (await hasColumn(prisma, 'DashboardSession', 'oauthAccessTokenCiphertext')) &&
    (await hasColumn(prisma, 'DashboardSession', 'oauthRefreshTokenCiphertext')) &&
    (await hasColumn(prisma, 'DashboardSession', 'oauthExpiresAt')) &&
    (await hasColumn(prisma, 'DashboardSession', 'lastAuthorizedSyncAt'))
  ) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" ("name") VALUES (?)`,
      '20260405190000_dashboard_session_oauth_refresh',
    );
  }
}

function getMigrationDefinitions() {
  if (cachedMigrationDefinitions) {
    return cachedMigrationDefinitions;
  }

  const migrationsDirectory = path.resolve(process.cwd(), 'prisma', 'migrations');
  const directories = readdirSync(migrationsDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory());

  if (directories.length === 0) {
    throw new Error('Nenhuma migration SQL foi encontrada para inicializar o banco SQLite.');
  }

  cachedMigrationDefinitions = directories
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      file: path.join(migrationsDirectory, entry.name, 'migration.sql'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((migration) => ({
      name: migration.name,
      statements: splitSqlStatements(readFileSync(migration.file, 'utf8')),
    }));

  return cachedMigrationDefinitions;
}

async function hasTable(prisma: PrismaClient, tableName: string) {
  const rows =
    (await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table'
          AND name = ?
      `,
      tableName,
    )) ?? [];

  return Number(rows[0]?.count ?? 0) > 0;
}

async function hasColumn(prisma: PrismaClient, tableName: string, columnName: string) {
  const escapedTableName = tableName.replaceAll('"', '""');
  const rows =
    (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
      `
        SELECT name
        FROM pragma_table_info("${escapedTableName}")
        WHERE name = ?
      `,
      columnName,
    )) ?? [];

  return rows.length > 0;
}

function splitSqlStatements(sql: string) {
  return sql
    .split(/;\s*(?:\r?\n|$)/u)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function getSqliteDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith(SQLITE_PREFIX)) {
    return null;
  }

  const { pathname } = splitSqliteUrl(databaseUrl);
  if (!pathname || pathname === ':memory:') {
    return null;
  }

  return path.normalize(pathname);
}

export function ensureSqliteDatabaseDirectory(databaseUrl: string) {
  const databasePath = getSqliteDatabasePath(databaseUrl);
  if (!databasePath) {
    return null;
  }

  mkdirSync(path.dirname(databasePath), { recursive: true });
  return databasePath;
}

function splitSqliteUrl(databaseUrl: string) {
  const raw = databaseUrl.slice(SQLITE_PREFIX.length);
  const queryIndex = raw.indexOf('?');

  if (queryIndex === -1) {
    return {
      pathname: raw,
      suffix: '',
    };
  }

  return {
    pathname: raw.slice(0, queryIndex),
    suffix: raw.slice(queryIndex),
  };
}
