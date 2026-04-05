import { PermissionFlagsBits } from 'discord.js';
import type { GuildQueue, Track } from 'discord-player';
import { AuthorizationCommandError, PreconditionCommandError, ValidationCommandError } from './errors.js';
import type { CommandContext } from './framework.js';
import { ensureAudioPlaybackAvailable } from './audioPlayback.js';
import { normalizePlayableQuery } from '../music/musicService.js';
import { hasAdministrativeControl, isOwnerUserId } from '../../core/security/ownerAccess.js';

export interface ActiveQueueOptions {
  requireSameVoice?: boolean;
  requireTrackOrItems?: boolean;
}

export function requireAdministrator(context: CommandContext, commandName: string) {
  if (
    !hasAdministrativeControl({
      userId: context.user?.id,
      member: context.member,
    })
  ) {
    throw new AuthorizationCommandError(
      `Apenas administradores do servidor ou o owner global do PHONIX podem usar o comando ${commandName}.`,
    );
  }
}

export function requireOwner(context: CommandContext, commandName: string) {
  if (!isOwnerUserId(context.user?.id)) {
    throw new AuthorizationCommandError(`Apenas o owner global do PHONIX pode usar o comando ${commandName}.`, {
      title: 'Acesso restrito ao owner',
    });
  }
}

export function requireAudioPlayback(context: CommandContext) {
  ensureAudioPlaybackAvailable(context.services.ffmpeg);
}

export function requireMemberVoiceChannel(context: CommandContext) {
  try {
    return context.services.music.requireMemberVoiceChannel(context.member);
  } catch (error) {
    throw new PreconditionCommandError(
      error instanceof Error ? error.message : 'Entre em um canal de voz para usar os comandos de musica do PHONIX.',
      { cause: error },
    );
  }
}

export function requireSameVoiceChannel(context: CommandContext) {
  try {
    return context.services.music.ensureSameVoiceChannel(context.member);
  } catch (error) {
    throw new PreconditionCommandError(
      error instanceof Error ? error.message : 'Voce precisa estar no mesmo canal de voz que o PHONIX.',
      { cause: error },
    );
  }
}

export function requireActiveQueue(context: CommandContext, options: ActiveQueueOptions = {}): GuildQueue {
  const queue = context.queue;
  const requireTrackOrItems = options.requireTrackOrItems ?? true;

  if (!queue || (requireTrackOrItems && !queue.currentTrack && queue.size === 0)) {
    throw new PreconditionCommandError('Ainda nao existe fila ativa neste servidor.', {
      title: 'Fila vazia',
    });
  }

  if ((options.requireSameVoice ?? true) && queue.channel) {
    requireSameVoiceChannel(context);
  }

  return queue;
}

export function requireCurrentTrack(queue: GuildQueue) {
  if (!queue.currentTrack) {
    throw new PreconditionCommandError('Nada tocando agora. Informe uma busca ou URL para salvar.');
  }

  return queue.currentTrack;
}

export function requireTrackAtQueueIndex(queue: GuildQueue, index: number): Track {
  const track = queue.tracks.at(index - 1);
  if (!track) {
    throw new ValidationCommandError('Nao existe faixa nessa posicao.');
  }

  return track as Track;
}

export async function resolveTrackForLibraryInput(context: CommandContext, query?: string) {
  if (!query) {
    const queue = context.queue;
    if (!queue || !queue.currentTrack) {
      throw new PreconditionCommandError('Nada tocando agora. Informe uma busca ou URL para salvar.');
    }

    if (queue.channel) {
      requireSameVoiceChannel(context);
    }

    return queue.currentTrack;
  }

  const normalizedQuery = normalizePlayableQuery(query);
  const result = await context.services.player.search(normalizedQuery, {
    requestedBy: context.user.id,
    searchEngine: context.services.music.resolveSearchEngine(typeof normalizedQuery === 'string' ? normalizedQuery : query),
  });

  if (result.isEmpty() || result.tracks.length === 0) {
    throw new ValidationCommandError('Nenhum resultado encontrado para essa busca.');
  }

  return result.tracks[0] as Track;
}
