import { PrismaClient } from '@prisma/client';
import { ensureSqliteDatabaseDirectory, normalizeSqliteDatabaseUrl, prepareSqliteDatabase } from './sqlite.js';

declare global {
  // eslint-disable-next-line no-var
  var __phonixPrisma__: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __phonixPrismaInit__: Promise<PrismaClient> | undefined;
}

export async function createPrismaClient(databaseUrl: string) {
  if (globalThis.__phonixPrisma__) {
    return globalThis.__phonixPrisma__;
  }

  if (!globalThis.__phonixPrismaInit__) {
    globalThis.__phonixPrismaInit__ = initializePrismaClient(databaseUrl);
  }

  const prisma = await globalThis.__phonixPrismaInit__;
  globalThis.__phonixPrisma__ = prisma;
  return prisma;
}

async function initializePrismaClient(databaseUrl: string) {
  const normalizedUrl = normalizeSqliteDatabaseUrl(databaseUrl);
  ensureSqliteDatabaseDirectory(normalizedUrl);

  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: normalizedUrl,
      },
    },
  });

  await prisma.$connect();
  await prepareSqliteDatabase(prisma, normalizedUrl);
  return prisma;
}
