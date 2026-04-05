import { createRequire } from 'node:module';
import { logger } from '../../core/logging/logger.js';

const require = createRequire(import.meta.url);

export interface VoiceCryptoRuntimeStatus {
  backend: 'native' | 'wasi' | 'unavailable';
  forcedWasi: boolean;
  detail: string;
}

let runtimeStatus: VoiceCryptoRuntimeStatus | null = null;

export function prepareVoiceCryptoRuntime(): VoiceCryptoRuntimeStatus {
  if (runtimeStatus) {
    return runtimeStatus;
  }

  if (process.env.NAPI_RS_FORCE_WASI === '1') {
    runtimeStatus = loadDaveyWithForcedWasi('NAPI_RS_FORCE_WASI ja estava ativo no ambiente.');
    return runtimeStatus;
  }

  try {
    require('@snazzah/davey');

    runtimeStatus = {
      backend: 'native',
      forcedWasi: false,
      detail: 'Binding nativo do DAVE carregado com sucesso.',
    };

    logger.info(
      {
        voiceCryptoBackend: runtimeStatus.backend,
        forcedWasi: runtimeStatus.forcedWasi,
      },
      'Voice crypto runtime ready',
    );

    return runtimeStatus;
  } catch (error) {
    if (!shouldFallbackToWasi(error)) {
      runtimeStatus = {
        backend: 'unavailable',
        forcedWasi: false,
        detail: formatRuntimeError(error),
      };

      logger.error(
        {
          voiceCryptoBackend: runtimeStatus.backend,
          forcedWasi: runtimeStatus.forcedWasi,
          detail: runtimeStatus.detail,
          err: error,
        },
        'Voice crypto runtime unavailable',
      );

      return runtimeStatus;
    }

    process.env.NAPI_RS_FORCE_WASI = '1';
    clearDaveyRequireCache();
    runtimeStatus = loadDaveyWithForcedWasi('Binding nativo do DAVE indisponivel neste host. Usando fallback WASI.');
    return runtimeStatus;
  }
}

export function getVoiceCryptoRuntimeStatus() {
  return runtimeStatus;
}

function loadDaveyWithForcedWasi(reason: string): VoiceCryptoRuntimeStatus {
  try {
    require('@snazzah/davey');

    const status: VoiceCryptoRuntimeStatus = {
      backend: 'wasi',
      forcedWasi: true,
      detail: `${reason} Fallback WASI pronto para conexoes de voz.`,
    };

    logger.warn(
      {
        voiceCryptoBackend: status.backend,
        forcedWasi: status.forcedWasi,
      },
      'Voice crypto runtime switched to WASI fallback',
    );

    return status;
  } catch (error) {
    const status: VoiceCryptoRuntimeStatus = {
      backend: 'unavailable',
      forcedWasi: true,
      detail: `Falha ao carregar o fallback WASI do DAVE. ${formatRuntimeError(error)}`,
    };

    logger.error(
      {
        voiceCryptoBackend: status.backend,
        forcedWasi: status.forcedWasi,
        detail: status.detail,
        err: error,
      },
      'Voice crypto runtime unavailable',
    );

    return status;
  }
}

function clearDaveyRequireCache() {
  for (const moduleName of ['@snazzah/davey', '@snazzah/davey-wasm32-wasi']) {
    try {
      const resolved = require.resolve(moduleName);
      delete require.cache[resolved];
    } catch {
      // Ignore modules that have not been resolved yet.
    }
  }
}

function shouldFallbackToWasi(error: unknown) {
  const message = formatRuntimeError(error).toLowerCase();

  return (
    message.includes('cannot find native binding') ||
    message.includes('controle de aplicativo bloqueou este arquivo') ||
    message.includes('app control blocked this file') ||
    message.includes('err_dlopen_failed') ||
    message.includes('@snazzah/davey-wasm32-wasi')
  );
}

function formatRuntimeError(error: unknown): string {
  if (error instanceof Error) {
    const detail = [error.message];

    const cause = error.cause;
    if (Array.isArray(cause)) {
      detail.push(
        cause
          .map((entry) => (entry instanceof Error ? entry.message : String(entry)))
          .filter(Boolean)
          .join(' | '),
      );
    } else if (cause instanceof Error) {
      detail.push(cause.message);
    }

    return detail.filter(Boolean).join(' ');
  }

  return String(error);
}
