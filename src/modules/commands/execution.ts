import { logger } from '../../core/logging/logger.js';
import { toCommandError } from './errors.js';
import type { CommandContext, CommandDefinition } from './framework.js';
import { mapCommandErrorKindToFailureCode } from '../music/playbackFaults.js';

export interface CommandTelemetry {
  command: string;
  source: 'slash' | 'prefix';
  guildId: string;
  userId: string;
  durationMs: number;
  status: 'ok' | 'error';
  errorKind?: string;
}

export async function executeCommand<TArgs>(
  command: CommandDefinition<TArgs>,
  context: CommandContext,
  parseArgs: () => TArgs,
) {
  const startedAt = performance.now();

  try {
    const args = parseArgs();
    const telemetryService = (context as { services?: { operationalTelemetry?: { recordCommandExecution: Function; recordFailure: Function } } }).services
      ?.operationalTelemetry;

    if (command.defer ?? true) {
      await context.defer();
    }

    await command.prepare?.(context, args);

    const payload = await command.execute(context, args);
    if (payload) {
      await context.reply(payload);
    }

    logger.info(
      buildTelemetry(command.name, context, {
        startedAt,
        status: 'ok',
      }),
      'Command executed',
    );

    telemetryService?.recordCommandExecution({
      ...buildTelemetry(command.name, context, {
        startedAt,
        status: 'ok',
      }),
    });
  } catch (error) {
    const commandError = toCommandError(error);
    const telemetryService = (context as { services?: { operationalTelemetry?: { recordCommandExecution: Function; recordFailure: Function } } }).services
      ?.operationalTelemetry;

    const telemetry = buildTelemetry(command.name, context, {
      startedAt,
      status: 'error',
      errorKind: commandError.kind,
    });

    const logPayload = {
      ...telemetry,
      err: error,
    };

    if (commandError.kind === 'infrastructure') {
      logger.error(logPayload, 'Command execution failed');
    } else if (commandError.kind === 'dependency') {
      logger.warn(logPayload, 'Command rejected with dependency issue');
    } else {
      logger.debug(logPayload, 'Command rejected with controlled error');
    }

    telemetryService?.recordCommandExecution(telemetry);
    const failureCode = commandError.operational?.code ?? mapCommandErrorKindToFailureCode(commandError.kind);
    if (failureCode) {
      const textChannelId = (context as { metadata?: { textChannelId?: string } }).metadata?.textChannelId;
      const voiceChannelId = (context as { member?: { voice?: { channelId?: string | null } } }).member?.voice?.channelId ?? null;

      telemetryService?.recordFailure({
        guildId: context.guild.id,
        channelId: voiceChannelId,
        textChannelId,
        userId: context.user.id,
        command: command.name,
        source: context.source,
        stage: commandError.operational?.stage ?? 'command',
        code: failureCode,
        message: commandError.message,
        provider: commandError.operational?.provider ?? 'unknown',
        pipeline: commandError.operational?.pipeline ?? 'unknown',
        recoverable: commandError.operational?.recoverable ?? false,
        terminal: commandError.operational?.terminal ?? commandError.kind === 'infrastructure',
      });
    }

    const replyErrorOptions =
      commandError.fields?.length || commandError.hint
        ? {
            fields: commandError.fields,
            hint: commandError.hint,
          }
        : undefined;

    if (replyErrorOptions) {
      await context.replyError(
        commandError.title,
        commandError.expose ? commandError.message : 'O PHONIX encontrou um erro interno ao processar este comando.',
        replyErrorOptions,
      );
    } else {
      await context.replyError(
        commandError.title,
        commandError.expose ? commandError.message : 'O PHONIX encontrou um erro interno ao processar este comando.',
      );
    }
  }
}

function buildTelemetry(
  command: string,
  context: CommandContext,
  input: {
    startedAt: number;
    status: CommandTelemetry['status'];
    errorKind?: string;
  },
): CommandTelemetry {
  return {
    command,
    source: context.source,
    guildId: context.guild.id,
    userId: context.user.id,
    durationMs: Math.round(performance.now() - input.startedAt),
    status: input.status,
    errorKind: input.errorKind,
  };
}
