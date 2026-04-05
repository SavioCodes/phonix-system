import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../src/core/logging/logger.js';
import { executeCommand } from '../../src/modules/commands/execution.js';
import {
  DependencyCommandError,
  InfrastructureCommandError,
  ValidationCommandError,
} from '../../src/modules/commands/errors.js';
import { PlaybackUnavailableError } from '../../src/modules/music/musicService.js';

describe('command execution pipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('auto-defers, replies with payload and logs success telemetry', async () => {
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => logger);
    const defer = vi.fn().mockResolvedValue(undefined);
    const reply = vi.fn().mockResolvedValue(undefined);
    const replyError = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({
      content: 'ok',
    });

    await executeCommand(
      {
        name: 'help',
        description: 'Mostra ajuda',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute,
      },
      {
        defer,
        reply,
        replyError,
        source: 'slash',
        guild: { id: 'guild-1' },
        user: { id: 'user-1' },
      } as never,
      () => ({}),
    );

    expect(defer).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(reply).toHaveBeenCalledWith({ content: 'ok' });
    expect(replyError).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy.mock.calls[0]?.[0]).toMatchObject({
      command: 'help',
      source: 'slash',
      guildId: 'guild-1',
      userId: 'user-1',
      status: 'ok',
    });
  });

  it('maps validation errors to a single user-facing error reply and debug log', async () => {
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi.fn().mockRejectedValue(new ValidationCommandError('Busca invalida.')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'prefix',
        guild: { id: 'guild-2' },
        user: { id: 'user-2' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith('PHONIX | Erro', 'Busca invalida.');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy.mock.calls[0]?.[0]).toMatchObject({
      command: 'play',
      status: 'error',
      errorKind: 'validation',
    });
  });

  it('runs the optional prepare hook after defer and before execute', async () => {
    const defer = vi.fn().mockResolvedValue(undefined);
    const prepare = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        prepare,
        execute,
      },
      {
        defer,
        reply: vi.fn().mockResolvedValue(undefined),
        replyError: vi.fn().mockResolvedValue(undefined),
        source: 'slash',
        guild: { id: 'guild-prepare' },
        user: { id: 'user-prepare' },
      } as never,
      () => ({ query: 'night drive' }),
    );

    expect(defer).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'slash',
      }),
      { query: 'night drive' },
    );
    expect(defer.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(execute.mock.invocationCallOrder[0]);
  });

  it('keeps dependency errors at warning level', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi.fn().mockRejectedValue(new DependencyCommandError('FFmpeg indisponivel.')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-9' },
        user: { id: 'user-9' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith('PHONIX | Erro', 'FFmpeg indisponivel.');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatchObject({
      command: 'play',
      status: 'error',
      errorKind: 'dependency',
    });
  });

  it('hides infrastructure details from the user and logs at error level', async () => {
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'playlist',
        description: 'Gerencia playlist',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi.fn().mockRejectedValue(new InfrastructureCommandError('falha interna real')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-3' },
        user: { id: 'user-3' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'PHONIX | Falha interna',
      'O PHONIX encontrou um erro interno ao processar este comando.',
    );
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.[0]).toMatchObject({
      command: 'playlist',
      status: 'error',
      errorKind: 'infrastructure',
    });
  });

  it('adds structured playback context for stream-unavailable errors', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi
          .fn()
          .mockRejectedValue(new PlaybackUnavailableError(undefined, 'youtube', 'youtube-dl')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-10' },
        user: { id: 'user-10' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'Stream indisponivel agora',
      'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
      expect.objectContaining({
        hint: expect.stringContaining('/doctor'),
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Leitura tecnica',
            value: expect.stringContaining('youtube-dl'),
          }),
        ]),
      }),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps recovery-specific guidance when a saved session is no longer playable', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'recover',
        description: 'Recupera sessao',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi
          .fn()
          .mockRejectedValue(new PlaybackUnavailableError('Nenhuma faixa salva continua tocavel. A sessao antiga sera descartada.')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-11' },
        user: { id: 'user-11' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'Recovery indisponivel agora',
      'Nenhuma faixa salva continua tocavel. A sessao antiga sera descartada.',
      expect.objectContaining({
        hint: expect.stringContaining('/doctor'),
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Leitura de recovery',
            value: expect.stringContaining('sessao persistida'),
          }),
        ]),
      }),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('uses a neutral technical fallback when the playback route is unavailable', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi
          .fn()
          .mockRejectedValue(new PlaybackUnavailableError(undefined, 'unknown', 'unknown')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-12' },
        user: { id: 'user-12' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'Stream indisponivel agora',
      'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Leitura tecnica',
            value: expect.stringContaining('nao ficou identificada a tempo pelo runtime'),
          }),
        ]),
      }),
    );
    expect(replyError.mock.calls[0]?.[2]?.fields?.[0]?.value).not.toContain('desconhecida');
    expect(replyError.mock.calls[0]?.[2]?.fields?.[0]?.value).not.toContain('desconhecido');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('surfaces observed extractor fallback context when the runtime reports a SoundCloud extractor failure', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi
          .fn()
          .mockRejectedValue(
            new PlaybackUnavailableError(
              undefined,
              'soundcloud',
              'soundcloud-extractor',
            ),
          ),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'prefix',
        guild: { id: 'guild-13' },
        user: { id: 'user-13' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'Stream indisponivel agora',
      'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
      expect.objectContaining({
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Leitura tecnica',
            value: expect.stringMatching(/SoundCloud \(fallback interno\).*extractor-fallback/su),
          }),
        ]),
      }),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('adds a compatibility hint when a youtubei stream keeps failing', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => logger);
    const replyError = vi.fn().mockResolvedValue(undefined);

    await executeCommand(
      {
        name: 'play',
        description: 'Toca faixa',
        data: {} as never,
        parsePrefix: vi.fn(),
        parseSlash: vi.fn(),
        execute: vi.fn().mockRejectedValue(new PlaybackUnavailableError(undefined, 'youtube', 'youtubei')),
      },
      {
        defer: vi.fn().mockResolvedValue(undefined),
        reply: vi.fn().mockResolvedValue(undefined),
        replyError,
        source: 'slash',
        guild: { id: 'guild-14' },
        user: { id: 'user-14' },
      } as never,
      () => ({}),
    );

    expect(replyError).toHaveBeenCalledWith(
      'Stream indisponivel agora',
      'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
      expect.objectContaining({
        hint: expect.stringContaining('compatibility'),
        fields: expect.arrayContaining([
          expect.objectContaining({
            name: 'Leitura tecnica',
            value: expect.stringContaining('youtubei'),
          }),
        ]),
      }),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
