import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { prepareSqliteDatabase } from '../../src/core/database/sqlite.js';

const rootDir = path.resolve(__dirname, '../..');
const tempRoot = path.join(rootDir, 'tests', 'tmp');

export function createTempTestDirectory(prefix: string) {
  mkdirSync(tempRoot, { recursive: true });
  return mkdtempSync(path.join(tempRoot, prefix));
}

export async function createPreparedSqliteTestDatabase(prefix: string, fileName = 'test.db') {
  const tempDir = createTempTestDirectory(prefix);
  const databaseUrl = `file:${path.join(tempDir, fileName).replaceAll('\\', '/')}`;
  const prismaClient = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  await prismaClient.$connect();
  await prepareSqliteDatabase(prismaClient, databaseUrl);

  return {
    tempDir,
    databaseUrl,
    prismaClient,
  };
}

export async function cleanupSqliteTestDatabase(prisma?: PrismaClient, tempDir?: string) {
  if (prisma) {
    await prisma.$disconnect();
  }

  if (tempDir) {
    await removeDirectoryWithRetry(tempDir);
  }
}

export async function removeDirectoryWithRetry(targetPath: string) {
  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const retryable =
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EBUSY' || error.code === 'ENOTEMPTY');

      if (!retryable || attempt === attempts) {
        throw error;
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, attempt * 50);
      });
    }
  }
}
