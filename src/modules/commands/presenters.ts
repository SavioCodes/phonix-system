import type { CommandReplyPayload } from './framework.js';
import { embeds } from '../ui/embeds.js';
import { componentsV2 } from '../ui/components-v2.js';
import { buildHelpNavigationComponents } from './helpComponents.js';
import {
  buildCollectionActionRows,
  buildConfigActionRows,
  buildDoctorActionRows,
  buildNowPlayingActionRows,
  buildPlayActionRows,
  buildQueueActionRows,
  buildRecoverActionRows,
} from './panelActions.js';
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
    case 'recover':
      return appendComponents(componentsV2.recoverResult(result), buildRecoverActionRows(result));
    case 'collection':
      return appendComponents(componentsV2.collectionView(result), buildCollectionActionRows(result));
    case 'play':
      return appendComponents(componentsV2.playResult(result), buildPlayActionRows(result));
    case 'queue':
      return appendComponents(componentsV2.queueView(result), buildQueueActionRows(result));
    case 'nowPlaying':
      return appendComponents(componentsV2.nowPlayingView(result), buildNowPlayingActionRows(result));
  }
}

export function presentGuildConfigResult(result: GuildConfigResult): CommandReplyPayload {
  return appendComponents(componentsV2.settings(result), buildConfigActionRows(result));
}

export function presentDoctorResult(result: DoctorResultView): CommandReplyPayload {
  return appendComponents(componentsV2.doctor(result), buildDoctorActionRows(result));
}

export function presentHelpResult(result: HelpResultView): CommandReplyPayload {
  return {
    embeds: [embeds.help(result)],
    components: buildHelpNavigationComponents(result),
  };
}

function appendComponents(payload: CommandReplyPayload, extraComponents: NonNullable<CommandReplyPayload['components']>) {
  if (extraComponents.length === 0) {
    return payload;
  }

  return {
    ...payload,
    components: [...(payload.components ?? []), ...extraComponents],
  };
}
