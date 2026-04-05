import { afterEach, describe, expect, it, vi } from 'vitest';
import { installProcessWarningHandler } from '../../src/app/process-warnings.js';
import { logger } from '../../src/core/logging/logger.js';

describe('process warning handler', () => {
  const originalEmitWarning = process.emitWarning;

  afterEach(() => {
    process.emitWarning = originalEmitWarning;
    delete (process as typeof process & { [key: symbol]: boolean | undefined })[Symbol.for('phonix.processWarningsInstalled')];
    delete (process as typeof process & { __phonixEmitWarningOriginal__?: typeof process.emitWarning }).__phonixEmitWarningOriginal__;
    delete (process as typeof process & { __phonixWarningFingerprints__?: Set<string> }).__phonixWarningFingerprints__;
    vi.restoreAllMocks();
  });

  it('suppresses known punycode warnings and records them once', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const recordRuntimeWarning = vi.fn();
    const fallbackEmitWarning = vi.fn();
    process.emitWarning = fallbackEmitWarning as typeof process.emitWarning;

    installProcessWarningHandler({
      recordRuntimeWarning,
    } as never);

    process.emitWarning('The `punycode` module is deprecated.', 'DeprecationWarning', 'DEP0040');
    process.emitWarning('The `punycode` module is deprecated.', 'DeprecationWarning', 'DEP0040');

    expect(recordRuntimeWarning).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(fallbackEmitWarning).not.toHaveBeenCalled();
  });
});
