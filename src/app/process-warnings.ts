import { logger } from '../core/logging/logger.js';
import type { OperationalTelemetryService } from '../modules/diagnostics/services/operationalTelemetryService.js';

const PATCH_FLAG = Symbol.for('phonix.processWarningsInstalled');
const SUPPRESSED_WARNING_CODES = new Set(['DEP0040']);

interface NormalizedWarning {
  name: string;
  message: string;
  code?: string;
}

export function installProcessWarningHandler(operationalTelemetry: OperationalTelemetryService) {
  const patchedProcess = process as typeof process & {
    [PATCH_FLAG]?: boolean;
    __phonixEmitWarningOriginal__?: typeof process.emitWarning;
    __phonixWarningFingerprints__?: Set<string>;
  };

  if (patchedProcess[PATCH_FLAG]) {
    return;
  }

  patchedProcess[PATCH_FLAG] = true;
  patchedProcess.__phonixEmitWarningOriginal__ = process.emitWarning.bind(process);
  patchedProcess.__phonixWarningFingerprints__ = new Set<string>();

  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    const normalized = normalizeWarning(warning, args);
    if (normalized && shouldSuppressWarning(normalized)) {
      const fingerprint = `${normalized.code ?? normalized.name}:${normalized.message}`;
      if (!patchedProcess.__phonixWarningFingerprints__?.has(fingerprint)) {
        patchedProcess.__phonixWarningFingerprints__?.add(fingerprint);
        operationalTelemetry.recordRuntimeWarning({
          name: normalized.name,
          code: normalized.code,
          message: normalized.message,
          detail: 'Warning upstream conhecido foi capturado e suprimido pelo PHONIX.',
        });
        logger.warn(
          {
            warningCode: normalized.code,
            warningName: normalized.name,
          },
          'Known upstream runtime warning suppressed and captured for diagnostics',
        );
      }

      return;
    }

    return patchedProcess.__phonixEmitWarningOriginal__?.(warning as never, ...(args as []));
  }) as typeof process.emitWarning;
}

function normalizeWarning(warning: string | Error, args: unknown[]): NormalizedWarning | null {
  if (warning instanceof Error) {
    const maybeCode = (warning as Error & { code?: string }).code;
    return {
      name: warning.name || 'Warning',
      message: warning.message,
      code: typeof maybeCode === 'string' ? maybeCode : undefined,
    };
  }

  const [typeOrOptions, maybeCode] = args;
  if (typeof typeOrOptions === 'object' && typeOrOptions !== null) {
    const warningLike = typeOrOptions as { type?: string; code?: string };
    return {
      name: warningLike.type ?? 'Warning',
      message: warning,
      code: warningLike.code,
    };
  }

  return {
    name: typeof typeOrOptions === 'string' ? typeOrOptions : 'Warning',
    message: warning,
    code: typeof maybeCode === 'string' ? maybeCode : undefined,
  };
}

function shouldSuppressWarning(warning: NormalizedWarning) {
  return warning.code !== undefined && SUPPRESSED_WARNING_CODES.has(warning.code);
}
