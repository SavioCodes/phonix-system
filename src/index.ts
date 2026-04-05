import 'dotenv/config';
import { logger } from './core/logging/logger.js';
import { prepareVoiceCryptoRuntime } from './modules/music/daveRuntime.js';

prepareVoiceCryptoRuntime();

const { bootstrap } = await import('./app/bootstrap.js');

bootstrap().catch(async (error) => {
  logger.error({ err: error }, 'Falha ao iniciar o PHONIX');
  const prisma = globalThis.__phonixPrisma__;
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(1);
});
