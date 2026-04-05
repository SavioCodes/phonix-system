import type { CommandReplyPayload } from './framework.js';
import { embeds } from '../ui/embeds.js';
import { buildHelpNavigationComponents } from './helpComponents.js';
import type { CommandView, DoctorResultView, GuildConfigResult, HelpResultView } from '../ui/view-models.js';

export function presentCommandView(result: CommandView): CommandReplyPayload {
  switch (result.kind) {
    case 'notice':
      return {
        embeds: [embeds.notice(result)],
      };
    case 'track':
      return {
        embeds: [embeds.trackCard(result.title, result.track, result.description, { fields: result.fields, hint: result.hint })],
      };
    case 'play':
      return {
        embeds: [embeds.playResult(result)],
      };
    case 'queue':
      return {
        embeds: [embeds.queueView(result)],
      };
    case 'nowPlaying':
      return {
        embeds: [embeds.nowPlayingView(result)],
      };
  }
}

export function presentGuildConfigResult(result: GuildConfigResult): CommandReplyPayload {
  return {
    embeds: [embeds.settings(result)],
  };
}

export function presentDoctorResult(result: DoctorResultView): CommandReplyPayload {
  return {
    embeds: [embeds.doctor(result)],
  };
}

export function presentHelpResult(result: HelpResultView): CommandReplyPayload {
  return {
    embeds: [embeds.help(result)],
    components: buildHelpNavigationComponents(result),
  };
}
