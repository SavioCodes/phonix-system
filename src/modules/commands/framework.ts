import type {
  ActionRowBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  Guild,
  GuildMember,
  MessageActionRowComponentBuilder,
  Message,
  PermissionResolvable,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  User,
} from 'discord.js';
import type { MusicService, QueueMetadata } from '../music/musicService.js';
import type { PlaybackSessionManager } from '../music/playbackSessionManager.js';
import type { AppServiceContainer, AppUseCaseContainer } from '../../app/service-container.js';
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
  content?: string;
  embeds?: EmbedBuilder[];
  components?: ActionRowBuilder<MessageActionRowComponentBuilder>[];
}

export type CommandResult = CommandReplyPayload | void;

export class CommandContext {
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
      await this.init.interaction.deferReply();
    }
  }

  public async reply(payload: CommandReplyPayload) {
    if (this.init.interaction) {
      if (this.init.interaction.deferred || this.init.interaction.replied) {
        return this.init.interaction.editReply(payload);
      }

      return this.init.interaction.reply(payload);
    }

    if (!this.init.message) {
      throw new Error('No message context available.');
    }

    return this.init.message.reply(payload);
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
