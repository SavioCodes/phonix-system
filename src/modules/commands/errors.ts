import { Prisma } from '@prisma/client';
import { PlaylistAlreadyExistsError, PlaylistLimitError } from '../library/services/playlistsService.js';
import type { NoticeFieldView } from '../ui/view-models.js';
import type {
  PlaybackFailureCode,
  PlaybackFailureStage,
  PlaybackPipeline,
  PlaybackProvider,
} from '../music/playbackFaults.js';
import {
  BotInAnotherVoiceChannelError,
  PlaybackSearchNoResultsError,
  PlaybackUnavailableError,
  QueueCapacityReachedError,
  SpotifyCredentialsRequiredError,
  UnsupportedPlaybackUrlError,
  UserNotInVoiceChannelError,
  VoiceChannelPermissionError,
  VoiceConnectionTimeoutError,
} from '../music/musicService.js';

export type CommandErrorKind =
  | 'validation'
  | 'authorization'
  | 'precondition'
  | 'conflict'
  | 'dependency'
  | 'infrastructure';

interface CommandErrorOptions {
  cause?: unknown;
  expose?: boolean;
  title?: string;
  fields?: NoticeFieldView[];
  hint?: string | null;
  operational?: CommandOperationalMetadata;
}

export interface CommandOperationalMetadata {
  stage?: PlaybackFailureStage;
  code?: PlaybackFailureCode;
  provider?: PlaybackProvider;
  pipeline?: PlaybackPipeline;
  recoverable?: boolean;
  terminal?: boolean;
}

export class CommandError extends Error {
  public readonly kind: CommandErrorKind;
  public readonly expose: boolean;
  public readonly title: string;
  public readonly fields: NoticeFieldView[] | undefined;
  public readonly hint: string | null;
  public readonly operational: CommandOperationalMetadata | null;

  public constructor(kind: CommandErrorKind, message: string, options: CommandErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.kind = kind;
    this.expose = options.expose ?? true;
    this.title = options.title ?? 'PHONIX | Erro';
    this.fields = options.fields;
    this.hint = options.hint ?? null;
    this.operational = options.operational ?? null;
  }
}

export class ValidationCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('validation', message, options);
  }
}

export class AuthorizationCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('authorization', message, options);
  }
}

export class PreconditionCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('precondition', message, options);
  }
}

export class ConflictCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('conflict', message, options);
  }
}

export class DependencyCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('dependency', message, options);
  }
}

export class InfrastructureCommandError extends CommandError {
  public constructor(message: string, options: CommandErrorOptions = {}) {
    super('infrastructure', message, {
      expose: options.expose ?? false,
      title: options.title ?? 'PHONIX | Falha interna',
      cause: options.cause,
    });
  }
}

export function toCommandError(error: unknown): CommandError {
  if (error instanceof CommandError) {
    return error;
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientRustPanicError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError
  ) {
    return new InfrastructureCommandError('O PHONIX encontrou um erro interno ao acessar os dados.', {
      cause: error,
    });
  }

  if (error instanceof PlaylistAlreadyExistsError || error instanceof PlaylistLimitError) {
    return new ConflictCommandError(error.message, { cause: error });
  }

  if (error instanceof UserNotInVoiceChannelError) {
    return new PreconditionCommandError(error.message, {
      cause: error,
      title: 'Entre em um canal de voz',
      operational: {
        stage: 'join',
        code: 'command_precondition',
        provider: 'discord-player',
        pipeline: 'voice',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof BotInAnotherVoiceChannelError) {
    return new PreconditionCommandError(error.message, {
      cause: error,
      title: 'Canal de voz diferente',
      operational: {
        stage: 'voice',
        code: 'command_precondition',
        provider: 'discord-player',
        pipeline: 'voice',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof VoiceChannelPermissionError) {
    return new DependencyCommandError(error.message, {
      cause: error,
      title: 'Permissao de voz ausente',
      operational: {
        stage: 'connect',
        code: 'permission_missing',
        provider: 'discord-player',
        pipeline: 'voice',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof SpotifyCredentialsRequiredError) {
    return new DependencyCommandError(error.message, {
      cause: error,
      title: 'Spotify indisponivel',
      operational: {
        stage: 'play',
        code: 'spotify_not_configured',
        provider: 'spotify',
        pipeline: 'spotify-bridge',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof VoiceConnectionTimeoutError) {
    return new DependencyCommandError(error.message, {
      cause: error,
      title: 'Conexao de voz falhou',
      operational: {
        stage: 'connect',
        code: 'voice_connection_timeout',
        provider: 'discord-player',
        pipeline: 'voice',
        recoverable: true,
        terminal: false,
      },
    });
  }

  if (error instanceof UnsupportedPlaybackUrlError) {
    return new ValidationCommandError(error.message, {
      cause: error,
      title: 'URL nao suportada',
      operational: {
        stage: 'play',
        code: 'unsupported_url',
        provider: 'unknown',
        pipeline: 'unknown',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof PlaybackSearchNoResultsError) {
    return new ValidationCommandError(error.message, {
      cause: error,
      title: 'Nada encontrado',
      operational: {
        stage: 'play',
        code: 'search_no_result',
        provider: error.provider,
        pipeline: error.pipeline,
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof QueueCapacityReachedError) {
    return new ConflictCommandError(error.message, {
      cause: error,
      title: 'Fila cheia',
      operational: {
        stage: 'queue',
        code: 'queue_capacity_reached',
        provider: 'discord-player',
        pipeline: 'unknown',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof PlaybackUnavailableError) {
    const playbackUnavailable = describePlaybackUnavailable(error);
    return new DependencyCommandError(error.message, {
      cause: error,
      title: playbackUnavailable.title,
      fields: playbackUnavailable.fields,
      hint: playbackUnavailable.hint,
      operational: {
        stage: playbackUnavailable.stage,
        code: playbackUnavailable.code,
        provider: error.provider,
        pipeline: error.pipeline,
        recoverable: true,
        terminal: false,
      },
    });
  }

  if (isDiscordPlayerNoResultError(error)) {
    return new ValidationCommandError('Nao foi possivel encontrar uma faixa tocavel para essa busca ou URL.', {
      cause: error,
      title: 'Nada encontrado',
      operational: {
        stage: 'play',
        code: 'search_no_result',
        provider: 'unknown',
        pipeline: 'unknown',
        recoverable: false,
        terminal: false,
      },
    });
  }

  if (error instanceof Error) {
    return new ValidationCommandError(error.message, { cause: error });
  }

  return new InfrastructureCommandError('Ocorreu um erro interno inesperado.', {
    cause: error,
  });
}

function isDiscordPlayerNoResultError(error: unknown): error is Error & { code: string } {
  return error instanceof Error && (error as { code?: string }).code === 'ERR_NO_RESULT';
}

function describePlaybackUnavailable(error: PlaybackUnavailableError): {
  title: string;
  fields: NoticeFieldView[];
  hint: string;
  stage: PlaybackFailureStage;
  code: PlaybackFailureCode;
} {
  const message = error.message.toLowerCase();

  if (
    message.includes('sessao salva') ||
    message.includes('faixa salva') ||
    message.includes('faixas salvas') ||
    message.includes('faixas para recuperar') ||
    message.includes('fila recuperada') ||
    message.includes('sessao antiga') ||
    message.includes('restaurar a sessao')
  ) {
    return {
      title: 'Recovery indisponivel agora',
      fields: [
        {
          name: 'Leitura de recovery',
          value: formatPlaybackContextLines(
            'O PHONIX encontrou a sessao persistida, mas ela nao ficou utilizavel nesta tentativa de retomada.',
            error.provider,
            error.pipeline,
            'A rota tecnica desta retomada nao ficou identificada no runtime atual.',
          ),
        },
      ],
      hint:
        'Rode `/doctor` para revisar session health e o ultimo bloqueio de recovery. Se a sessao antiga nao estiver mais aproveitavel, inicie uma fila nova com `/play`.',
      stage: 'recovery',
      code: 'recovery_failed',
    };
  }

  return {
    title: 'Stream indisponivel agora',
    fields: [
      {
        name: 'Leitura tecnica',
        value: formatPlaybackContextLines(
          'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel nesta tentativa.',
          error.provider,
          error.pipeline,
          'A rota observada desta tentativa nao ficou identificada a tempo pelo runtime.',
        ),
      },
    ],
    hint: buildPlaybackUnavailableHint(error),
    stage: 'stream',
    code: 'stream_unavailable',
  };
}

function buildPlaybackUnavailableHint(error: PlaybackUnavailableError) {
  if (error.provider === 'youtube' && error.pipeline === 'youtubei') {
    return 'Tente repetir a mesma busca ou usar outra URL. Se o bloqueio continuar, rode `/doctor` para verificar pipeline, bitrate e session health. Se o runtime estiver em `fidelity`, teste temporariamente `compatibility` para confirmar se a falha esta no pipeline nativo atual.';
  }

  return 'Tente repetir a mesma busca, use outra URL ou escolha outra faixa. Se o bloqueio continuar, rode `/doctor` para verificar pipeline, bitrate e session health.';
}

function formatPlaybackContextLines(
  headline: string,
  provider: CommandOperationalMetadata['provider'],
  pipeline: CommandOperationalMetadata['pipeline'],
  unknownFallback: string,
) {
  const lines = [headline];

  const formattedProvider = formatPlaybackProvider(provider);
  if (formattedProvider) {
    lines.push(`Origem: **${formattedProvider}**`);
  }

  const formattedPipeline = formatPlaybackPipeline(pipeline);
  if (formattedPipeline) {
    lines.push(`Pipeline: **${formattedPipeline}**`);
  }

  if (!formattedProvider && !formattedPipeline) {
    lines.push(unknownFallback);
  }

  return lines.join('\n');
}

function formatPlaybackProvider(provider: CommandOperationalMetadata['provider']) {
  if (provider === 'youtube') {
    return 'YouTube';
  }

  if (provider === 'spotify') {
    return 'Spotify';
  }

  if (provider === 'soundcloud') {
    return 'SoundCloud (fallback interno)';
  }

  if (provider === 'discord-player') {
    return 'discord-player';
  }

  return null;
}

function formatPlaybackPipeline(pipeline: CommandOperationalMetadata['pipeline']) {
  if (pipeline === 'youtube-dl') {
    return 'youtube-dl';
  }

  if (pipeline === 'youtubei') {
    return 'youtubei';
  }

  if (pipeline === 'spotify-bridge') {
    return 'spotify-bridge';
  }

  if (pipeline === 'soundcloud-extractor') {
    return 'extractor-fallback';
  }

  if (pipeline === 'ffmpeg') {
    return 'ffmpeg';
  }

  if (pipeline === 'voice') {
    return 'voice';
  }

  return null;
}
