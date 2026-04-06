import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageActionRowComponentBuilder,
} from 'discord.js';
import type {
  CollectionView,
  DoctorResultView,
  GuildConfigResult,
  NowPlayingView,
  PlayResultView,
  QueueView,
  RecoverView,
} from '../ui/view-models.js';

const PANEL_COMPONENT_PREFIX = 'phx';

export type PanelSurface = 'play' | 'queue' | 'now' | 'recover' | 'config' | 'doctor' | 'library';

export type PanelAction =
  | 'queue'
  | 'now'
  | 'refresh'
  | 'play-lead'
  | 'open-lead'
  | 'play-collection'
  | 'shuffle'
  | 'pause'
  | 'resume'
  | 'doctor'
  | 'config'
  | 'autoplay-enable'
  | 'autoplay-disable'
  | 'resume-enable'
  | 'resume-disable';

export interface ParsedPanelCustomId {
  surface: PanelSurface;
  action: PanelAction;
  guildId: string;
  userId: string;
  context: string | null;
}

export function buildPlayActionRows(view: PlayResultView) {
  if (!view.navigation) {
    return [];
  }

  return buildActionRows([
    createButton('play', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.navigation),
    createButton('play', 'now', 'Now Playing', ButtonStyle.Primary, view.navigation),
  ]);
}

export function buildQueueActionRows(view: QueueView) {
  if (!view.navigation) {
    return [];
  }

  return buildActionRows([
    createButton('queue', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.navigation),
    createButton('queue', 'now', 'Now Playing', ButtonStyle.Primary, view.navigation),
    createButton('queue', 'shuffle', 'Embaralhar', ButtonStyle.Secondary, view.navigation),
  ]);
}

export function buildNowPlayingActionRows(view: NowPlayingView) {
  if (!view.navigation) {
    return [];
  }

  const playbackToggle =
    view.playbackStateLabel === 'pausada'
      ? createButton('now', 'resume', 'Retomar', ButtonStyle.Success, view.navigation)
      : createButton('now', 'pause', 'Pausar', ButtonStyle.Secondary, view.navigation);

  return buildActionRows([
    createButton('now', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.navigation),
    createButton('now', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.navigation),
    playbackToggle,
  ]);
}

export function buildRecoverActionRows(view: RecoverView) {
  if (!view.navigation) {
    return [];
  }

  return buildActionRows([
    createButton('recover', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.navigation),
    createButton('recover', 'now', 'Now Playing', ButtonStyle.Primary, view.navigation),
    createButton('recover', 'doctor', 'Diagnostico', ButtonStyle.Secondary, view.navigation),
  ]);
}

export function buildConfigActionRows(view: GuildConfigResult) {
  if (!view.navigation) {
    return [];
  }

  return buildActionRows([
    createButton('config', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.navigation),
    createButton(
      'config',
      view.settings.autoplayEnabled ? 'autoplay-disable' : 'autoplay-enable',
      view.settings.autoplayEnabled ? 'Desativar autoplay' : 'Ativar autoplay',
      view.settings.autoplayEnabled ? ButtonStyle.Secondary : ButtonStyle.Success,
      view.navigation,
    ),
    createButton(
      'config',
      view.settings.resumeQueueEnabled ? 'resume-disable' : 'resume-enable',
      view.settings.resumeQueueEnabled ? 'Desativar resume' : 'Ativar resume',
      view.settings.resumeQueueEnabled ? ButtonStyle.Secondary : ButtonStyle.Success,
      view.navigation,
    ),
    createButton('config', 'doctor', 'Diagnostico', ButtonStyle.Primary, view.navigation),
  ]);
}

export function buildDoctorActionRows(view: DoctorResultView) {
  if (!view.navigation) {
    return [];
  }

  return buildActionRows([
    createButton('doctor', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.navigation),
    createButton('doctor', 'config', 'Configuracoes', ButtonStyle.Primary, view.navigation),
  ]);
}

export function buildCollectionActionRows(view: CollectionView) {
  if (!view.panel) {
    return [];
  }

  switch (view.panel.surface) {
    case 'favorites':
      return buildActionRows([
        createButton('library', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.panel, false, 'favorites'),
        createButton('library', 'play-lead', 'Tocar destaque', ButtonStyle.Primary, view.panel, !view.panel.hasLeadAction, 'favorites'),
        createButton('library', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.panel, false, 'favorites'),
      ]);
    case 'history':
      return buildActionRows([
        createButton('library', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.panel, false, 'history'),
        createButton('library', 'play-lead', 'Tocar destaque', ButtonStyle.Primary, view.panel, !view.panel.hasLeadAction, 'history'),
        createButton('library', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.panel, false, 'history'),
      ]);
    case 'playlists':
      return buildActionRows([
        createButton('library', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.panel, false, 'playlists'),
        createButton('library', 'open-lead', 'Abrir destaque', ButtonStyle.Primary, view.panel, !view.panel.hasLeadAction, buildPlaylistContext(view.panel.contextId)),
        createButton('library', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.panel, false, 'playlists'),
      ]);
    case 'playlist':
      return buildActionRows([
        createButton('library', 'refresh', 'Atualizar', ButtonStyle.Secondary, view.panel, false, buildPlaylistContext(view.panel.contextId)),
        createButton('library', 'play-collection', 'Tocar playlist', ButtonStyle.Primary, view.panel, !view.panel.hasLeadAction, buildPlaylistContext(view.panel.contextId)),
        createButton('library', 'queue', 'Fila ativa', ButtonStyle.Secondary, view.panel, false, buildPlaylistContext(view.panel.contextId)),
      ]);
  }
}

export function parsePanelCustomId(customId: string): ParsedPanelCustomId | null {
  const parts = customId.split(':');
  const [prefix, surface, action, guildId, userId, context] = parts;

  if (parts.length < 5 || parts.length > 6 || prefix !== PANEL_COMPONENT_PREFIX || !guildId || !userId) {
    return null;
  }

  if (!isPanelSurface(surface) || !isPanelAction(action)) {
    return null;
  }

  return {
    surface,
    action,
    guildId,
    userId,
    context: context ?? null,
  };
}

function createButton(
  surface: PanelSurface,
  action: PanelAction,
  label: string,
  style: ButtonStyle,
  navigation: { guildId: string; userId: string },
  disabled = false,
  context?: string,
) {
  return new ButtonBuilder()
    .setCustomId(buildPanelCustomId(surface, action, navigation.guildId, navigation.userId, context))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);
}

function buildPanelCustomId(surface: PanelSurface, action: PanelAction, guildId: string, userId: string, context?: string) {
  return [PANEL_COMPONENT_PREFIX, surface, action, guildId, userId, context].filter(Boolean).join(':');
}

function buildActionRows(buttons: ButtonBuilder[]) {
  if (buttons.length === 0) {
    return [];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(buttons) as ActionRowBuilder<MessageActionRowComponentBuilder>,
  ];
}

function isPanelSurface(value: string): value is PanelSurface {
  return ['play', 'queue', 'now', 'recover', 'config', 'doctor', 'library'].includes(value);
}

function isPanelAction(value: string): value is PanelAction {
  return [
    'queue',
    'now',
    'refresh',
    'play-lead',
    'open-lead',
    'play-collection',
    'shuffle',
    'pause',
    'resume',
    'doctor',
    'config',
    'autoplay-enable',
    'autoplay-disable',
    'resume-enable',
    'resume-disable',
  ].includes(value);
}

function buildPlaylistContext(contextId: string | null) {
  return contextId ? `playlist.${contextId}` : 'playlist';
}
