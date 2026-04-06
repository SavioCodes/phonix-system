import { MessageFlags, type ButtonInteraction, type Guild, type GuildMember, type MessageEditOptions } from 'discord.js';
import { logger } from '../../core/logging/logger.js';
import { toCommandError } from './errors.js';
import type { CommandReplyPayload, CommandServices } from './framework.js';
import {
  parsePanelCustomId,
  type PanelAction,
  type PanelSurface,
} from './panelActions.js';
import {
  presentCommandView,
  presentDoctorResult,
  presentGuildConfigResult,
} from './presenters.js';
import { embeds } from '../ui/embeds.js';

export async function handlePanelComponentInteraction(
  interaction: ButtonInteraction,
  services: CommandServices,
) {
  const parsed = parsePanelCustomId(interaction.customId);
  if (!parsed) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guild || interaction.guildId !== parsed.guildId) {
    await replyEphemeral(interaction, 'Este painel ficou invalido para esta guild. Rode o comando novamente.');
    return true;
  }

  if (interaction.user.id !== parsed.userId) {
    await replyEphemeral(interaction, 'Este painel pertence a outra pessoa. Rode o comando novamente para abrir o seu.');
    return true;
  }

  try {
    await interaction.deferUpdate();
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const payload = await resolvePanelPayload({
      surface: parsed.surface,
      action: parsed.action,
      parsedContext: parsed.context,
      services,
      interaction,
      member,
    });

    await interaction.message.edit(toMessageEditOptions(payload));
  } catch (error) {
    logger.warn(
      {
        err: error,
        guildId: interaction.guildId,
        userId: interaction.user.id,
        customId: interaction.customId,
      },
      'Panel component interaction failed',
    );

    const commandError = toCommandError(error);
    await interaction.followUp({
      embeds: [
        embeds.notice({
          kind: 'notice',
          variant: commandError.kind === 'dependency' ? 'warning' : 'error',
          title: commandError.title,
          description: commandError.expose ? commandError.message : 'O PHONIX nao conseguiu concluir esta interacao agora.',
          fields: commandError.fields,
          hint:
            commandError.hint ??
            'Rode o comando novamente para reconstruir o painel ou use `/doctor` se o estado operacional continuar instavel.',
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  return true;
}

async function resolvePanelPayload(input: {
  surface: PanelSurface;
  action: PanelAction;
  parsedContext: string | null;
  services: CommandServices;
  interaction: ButtonInteraction;
  member: GuildMember;
}): Promise<CommandReplyPayload> {
  const guildId = input.interaction.guildId ?? input.interaction.guild?.id;
  const userId = input.interaction.user.id;
  const guild = input.interaction.guild;

  if (!guildId || !guild) {
    throw new Error('Interacao de painel sem guild valida.');
  }

  switch (input.surface) {
    case 'play':
      if (input.action === 'queue') {
        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'now') {
        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      break;
    case 'queue':
      if (input.action === 'refresh') {
        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'now') {
        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'shuffle') {
        await input.services.useCases.playback.shuffle({
          guildId,
          member: input.member,
          userId,
        });

        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      break;
    case 'now':
      if (input.action === 'refresh') {
        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'queue') {
        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'pause') {
        await input.services.useCases.playback.pause({
          guildId,
          member: input.member,
          userId,
        });

        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'resume') {
        await input.services.useCases.playback.resume({
          guildId,
          member: input.member,
          userId,
        });

        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      break;
    case 'recover':
      if (input.action === 'queue') {
        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'now') {
        return presentCommandView(
          await input.services.useCases.playback.nowPlaying({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.action === 'doctor') {
        return presentDoctorResult(
          await input.services.useCases.admin.doctor({
            client: input.interaction.client,
            guild,
            member: input.member,
            userId,
            textChannelId: input.interaction.channelId,
          }),
        );
      }

      break;
    case 'config':
      if (input.action === 'refresh') {
        return presentGuildConfigResult(
          await input.services.useCases.admin.configView({
            guildId,
            userId,
            liveVolume: input.services.player.nodes.get(guildId)?.node.volume ?? null,
          }),
        );
      }

      if (input.action === 'doctor') {
        return presentDoctorResult(
          await input.services.useCases.admin.doctor({
            client: input.interaction.client,
            guild,
            member: input.member,
            userId,
            textChannelId: input.interaction.channelId,
          }),
        );
      }

      if (input.action === 'autoplay-enable' || input.action === 'autoplay-disable') {
        await input.services.useCases.admin.setAutoplay({
          guildId,
          member: input.member,
          userId,
          enabled: input.action === 'autoplay-enable',
        });

        return presentGuildConfigResult(
          await input.services.useCases.admin.configView({
            guildId,
            userId,
            liveVolume: input.services.player.nodes.get(guildId)?.node.volume ?? null,
          }),
        );
      }

      if (input.action === 'resume-enable' || input.action === 'resume-disable') {
        await input.services.useCases.admin.setResumeQueue({
          guildId,
          member: input.member,
          userId,
          enabled: input.action === 'resume-enable',
        });

        return presentGuildConfigResult(
          await input.services.useCases.admin.configView({
            guildId,
            userId,
            liveVolume: input.services.player.nodes.get(guildId)?.node.volume ?? null,
          }),
        );
      }

      break;
    case 'doctor':
      if (input.action === 'refresh') {
        return presentDoctorResult(
          await input.services.useCases.admin.doctor({
            client: input.interaction.client,
            guild,
            member: input.member,
            userId,
            textChannelId: input.interaction.channelId,
          }),
        );
      }

      if (input.action === 'config') {
        return presentGuildConfigResult(
          await input.services.useCases.admin.configView({
            guildId,
            userId,
            liveVolume: input.services.player.nodes.get(guildId)?.node.volume ?? null,
          }),
        );
      }

      break;
    case 'library': {
      const libraryInput = {
        guildId,
        user: input.interaction.user,
        member: input.member,
        metadata: {
          textChannelId: input.interaction.channelId,
        },
      };
      const playlistContextId = parsePlaylistPanelContext(input.parsedContext);

      if (input.action === 'queue') {
        return presentCommandView(
          await input.services.useCases.playback.queue({
            guildId,
            member: input.member,
            userId,
          }),
        );
      }

      if (input.parsedContext === 'favorites') {
        if (input.action === 'refresh') {
          return presentCommandView(await input.services.useCases.library.favoriteList(libraryInput));
        }

        if (input.action === 'play-lead') {
          return presentCommandView(await input.services.useCases.library.favoritePlayLead(libraryInput));
        }
      }

      if (input.parsedContext === 'history') {
        if (input.action === 'refresh') {
          return presentCommandView(await input.services.useCases.library.history(libraryInput));
        }

        if (input.action === 'play-lead') {
          return presentCommandView(await input.services.useCases.library.historyPlayLead(libraryInput));
        }
      }

      if (input.parsedContext === 'playlists') {
        if (input.action === 'refresh') {
          return presentCommandView(
            await input.services.useCases.library.playlistList({
              ...libraryInput,
              name: undefined,
            }),
          );
        }
      }

      if (playlistContextId) {
        if (input.action === 'open-lead') {
          return presentCommandView(
            await input.services.useCases.library.playlistListById({
              ...libraryInput,
              playlistId: playlistContextId,
            }),
          );
        }

        if (input.action === 'refresh') {
          return presentCommandView(
            await input.services.useCases.library.playlistListById({
              ...libraryInput,
              playlistId: playlistContextId,
            }),
          );
        }

        if (input.action === 'play-collection') {
          return presentCommandView(
            await input.services.useCases.library.playlistPlayById({
              ...libraryInput,
              playlistId: playlistContextId,
            }),
          );
        }
      }

      break;
    }
  }

  throw new Error('Interacao de painel invalida para esta superficie.');
}

function toMessageEditOptions(payload: CommandReplyPayload): MessageEditOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
  };
}

function parsePlaylistPanelContext(context: string | null) {
  if (!context || !context.startsWith('playlist.')) {
    return null;
  }

  return context.slice('playlist.'.length) || null;
}

async function replyEphemeral(interaction: ButtonInteraction, content: string) {
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ content, flags: MessageFlags.Ephemeral });
}
