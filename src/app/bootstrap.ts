import 'dotenv/config';
import { logger } from '../core/logging/logger.js';
import { createPhonixApp } from './create-phonix-app.js';

export async function bootstrap() {
  const app = await createPhonixApp();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Encerrando PHONIX...');
    await app.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  await app.start();
}

