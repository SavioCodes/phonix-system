import type {
  ChatInputCommandInteraction,
  Client,
  Guild,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  Message,
  MessageCreateOptions,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  User,
} from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { MusicService, QueueMetadata } from '../music/musicService.js';
import type { PlaybackSessionManager } from '../music/playbackSessionManager.js';
import type { AppServiceContainer, AppUseCaseContainer } from '../../app/service-container.js';
import { logger } from '../../core/logging/logger.js';
import { embeds } from '../ui/embeds.js';
import type { NoticeFieldView } from '../ui/view-models.js';
import { ValidationCommandError } from './errors.js';
import { hasAdministrativeControl, isOwnerUserId } from '../../core/security/ownerAccess.js';

export interface CommandServices extends AppServiceContainer {
  music: MusicService;
  playbackSessionManager: PlaybackSessionManager;
  useCases: AppUseCaseContainer;
}

export interface CommandContextInit {
  client: Client;
  services: CommandServices;
  guild: Guild;
  member: GuildMember;
  user: User;
  channelId: string;
  source: 'slash' | 'prefix';
  interaction?: ChatInputCommandInteraction;
  message?: Message;
}

export interface CommandReplyPayload {
  content?: MessageCreateOptions['content'];
  embeds?: MessageCreateOptions['embeds'];
  components?: MessageCreateOptions['components'];
  flags?: number;
}

export type CommandResult = CommandReplyPayload | void;

export class CommandContext {
  private interactionResponseUnavailable = false;

  public constructor(private readonly init: CommandContextInit) {}

  public get client() {
    return this.init.client;
  }

  public get services() {
    return this.init.services;
  }

  public get guild() {
    return this.init.guild;
  }

  public get member() {
    return this.init.member;
  }

  public get user() {
    return this.init.user;
  }

  public get source() {
    return this.init.source;
  }

  public memberHasPermission(permission: PermissionResolvable) {
    return this.member.permissions.has(permission);
  }

  public isOwner() {
    return isOwnerUserId(this.user.id);
  }

  public hasAdministrativeControl() {
    return hasAdministrativeControl({
      userId: this.user.id,
      member: this.member,
    });
  }

  public get queue() {
    return this.services.player.nodes.get<QueueMetadata>(this.guild.id);
  }

  public get metadata(): QueueMetadata {
    return {
      textChannelId: this.init.channelId,
    };
  }

  public async defer() {
    if (this.init.interaction && !this.init.interaction.deferred && !this.init.interaction.replied) {
      try {
        await this.init.interaction.deferReply();
      } catch (error) {
        if (isInteractionLifecycleError(error)) {
          this.interactionResponseUnavailable = true;
          logger.warn(
            {
              guildId: this.guild.id,
              userId: this.user.id,
              source: this.source,
              err: error,
            },
            'Slash interaction expired before PHONIX could acknowledge the command',
          );
          return false;
        }

        throw error;
      }
    }

    return true;
  }

  public async reply(payload: CommandReplyPayload) {
    if (this.init.interaction) {
      if (this.interactionResponseUnavailable) {
        return undefined;
      }

      try {
        if (this.init.interaction.deferred || this.init.interaction.replied) {
          return await this.init.interaction.editReply(toInteractionEditReplyOptions(payload));
        }

        return await this.init.interaction.reply(toInteractionReplyOptions(payload));
      } catch (error) {
        if (isInteractionLifecycleError(error)) {
          this.interactionResponseUnavailable = true;
          logger.warn(
            {
              guildId: this.guild.id,
              userId: this.user.id,
              source: this.source,
              err: error,
            },
            'PHONIX could not deliver the interaction response because the interaction was no longer valid',
          );
          return undefined;
        }

        throw error;
      }
    }

    if (!this.init.message) {
      throw new Error('No message context available.');
    }

    return this.init.message.reply({
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components,
      flags: payload.flags,
    });
  }

  public async replyError(
    title: string,
    description: string,
    options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
  ) {
    return this.reply({
      embeds: [
        embeds.notice({
          kind: 'notice',
          variant: 'error',
          title,
          description,
          fields: options.fields,
          hint:
            options.hint ??
            'Revise o contexto do comando, corrija o bloqueio acima e tente novamente. Se o problema persistir, rode `/doctor` para aprofundar o diagnostico.',
        }),
      ],
    });
  }

  public async signalTyping() {
    if (!this.init.message) {
      return;
    }

    if ('sendTyping' in this.init.message.channel) {
      await this.init.message.channel.sendTyping();
    }
  }
}

function toInteractionReplyOptions(payload: CommandReplyPayload): InteractionReplyOptions {
  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    flags: payload.flags,
  };
}

function toInteractionEditReplyOptions(payload: CommandReplyPayload): InteractionEditReplyOptions {
  const flags = normalizeInteractionEditFlags(payload.flags);

  if (flags === undefined) {
    return {
      content: payload.content,
      embeds: payload.embeds,
      components: payload.components,
    };
  }

  return {
    content: payload.content,
    embeds: payload.embeds,
    components: payload.components,
    flags,
  };
}

function normalizeInteractionEditFlags(flags: CommandReplyPayload['flags']): InteractionEditReplyOptions['flags'] {
  if (flags === undefined) {
    return undefined;
  }

  const allowed = flags & (MessageFlags.SuppressEmbeds | MessageFlags.IsComponentsV2);

  return allowed === 0 ? undefined : (allowed as InteractionEditReplyOptions['flags']);
}

function isInteractionLifecycleError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = (error as { code?: number | string }).code;
  return code === 10062 || code === 10015 || code === 40060;
}

export interface CommandDefinition<TArgs> {
  name: string;
  description: string;
  aliases?: string[];
  defer?: boolean;
  prepare?(context: CommandContext, args: TArgs): Promise<void>;
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  parsePrefix(tokens: string[]): TArgs;
  parseSlash(interaction: ChatInputCommandInteraction): TArgs;
  execute(context: CommandContext, args: TArgs): Promise<CommandResult>;
}

export function parseInteger(value: string | null | undefined, fieldName: string) {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isInteger(parsed)) {
    throw new ValidationCommandError(`Informe um numero valido para ${fieldName}.`, {
      title: 'Numero invalido',
    });
  }

  return parsed;
}
