import type { Client } from 'discord.js';
import { AuthorizationCommandError } from '../../commands/errors.js';
import type { NoticeView } from '../../ui/view-models.js';
import type { OwnerControlService } from '../services/ownerControlService.js';

interface OwnerUseCaseDeps {
  ownerControl: OwnerControlService;
}

interface OwnerScopedInput {
  client: Client;
  requesterId: string;
}

export function createOwnerUseCases(deps: OwnerUseCaseDeps) {
  return {
    async status(input: OwnerScopedInput): Promise<NoticeView> {
      ensureOwner(deps.ownerControl, input.requesterId, 'owner');
      return deps.ownerControl.createStatusNotice(input.client);
    },

    async incidents(input: OwnerScopedInput): Promise<NoticeView> {
      ensureOwner(deps.ownerControl, input.requesterId, 'owner');
      return deps.ownerControl.createIncidentsNotice(input.client);
    },

    async guilds(input: OwnerScopedInput): Promise<NoticeView> {
      ensureOwner(deps.ownerControl, input.requesterId, 'owner');
      return deps.ownerControl.createGuildsNotice(input.client);
    },

    async officialGuild(input: OwnerScopedInput): Promise<NoticeView> {
      ensureOwner(deps.ownerControl, input.requesterId, 'owner');
      return deps.ownerControl.createOfficialGuildNotice(input.client);
    },

    async notifyTest(input: OwnerScopedInput): Promise<NoticeView> {
      ensureOwner(deps.ownerControl, input.requesterId, 'owner');
      return deps.ownerControl.createNotifyTestNotice(input.client);
    },
  };
}

function ensureOwner(ownerControl: OwnerControlService, requesterId: string, commandName: string) {
  if (!ownerControl.isOwnerUserId(requesterId)) {
    throw new AuthorizationCommandError(`Apenas o owner global do PHONIX pode usar o comando ${commandName}.`, {
      title: 'Acesso restrito ao owner',
    });
  }
}
