import { MessageFlags } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { presentCommandView, presentHelpResult } from '../../src/modules/commands/presenters.js';
import type {
  CollectionView,
  HelpResultView,
  NowPlayingView,
  QueueView,
  RecoverView,
} from '../../src/modules/ui/view-models.js';
import { renderDiscordValue, renderEmbed } from '../support/discordPayload.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('Components V2 presentation', () => {
  it('renders queue as a Components V2 operational panel', () => {
    const payload = presentCommandView(createQueueView());

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.embeds).toBeUndefined();

    const rendered = renderDiscordValue<{ components?: Array<{ content?: string }> }>(payload.components?.[0] as never);
    expect(rendered?.components?.some((component) => component.content?.includes('PHONIX | Fila ativa'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('Session snapshot'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('youtube/youtube-dl'))).toBe(true);
  });

  it('renders nowplaying as a Components V2 media panel', () => {
    const payload = presentCommandView(createNowPlayingView());

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.embeds).toBeUndefined();

    const rendered = renderDiscordValue<{ components?: Array<{ content?: string }> }>(payload.components?.[0] as never);
    expect(rendered?.components?.some((component) => component.content?.includes('PHONIX | Tocando agora'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('Progresso'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('Night Drive'))).toBe(true);
  });

  it('renders recover as a dedicated Components V2 recovery panel', () => {
    const payload = presentCommandView(createRecoverView());

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.embeds).toBeUndefined();

    const rendered = renderDiscordValue<{ components?: Array<{ content?: string }> }>(payload.components?.[0] as never);
    expect(rendered?.components?.some((component) => component.content?.includes('Sessao restaurada com ressalvas'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('Resumo do recovery'))).toBe(true);
  });

  it('renders library collections as Components V2 panels', () => {
    const payload = presentCommandView(createCollectionView());

    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.embeds).toBeUndefined();

    const rendered = renderDiscordValue<{ components?: Array<{ content?: string }> }>(payload.components?.[0] as never);
    expect(rendered?.components?.some((component) => component.content?.includes('Favoritos salvos'))).toBe(true);
    expect(rendered?.components?.some((component) => component.content?.includes('Night Drive'))).toBe(true);
  });

  it('keeps help on the classic embed + action row path', () => {
    const payload = presentHelpResult(createHelpView());

    expect(payload.flags).toBeUndefined();
    expect(payload.embeds).toHaveLength(1);
    expect(renderEmbed(payload.embeds?.[0])?.title).toBe('PHONIX | Comece por aqui');
    expect(payload.components).toHaveLength(2);
  });
});

function createQueueView(): QueueView {
  return {
    kind: 'queue',
    title: 'PHONIX | Fila ativa',
    description: 'Sessao ativa em **Synth Room**.',
    currentTrack: {
      title: 'Night Drive',
      author: 'Nova',
      duration: '4:02',
      thumbnail: 'https://example.com/thumb.png',
      url: 'https://youtube.com/watch?v=night-drive',
      sourceLabel: 'YouTube',
    },
    currentProgressBar: '[=====-----]',
    upcomingTracks: [{ position: 1, title: 'Orbit', duration: '3:50' }],
    size: 1,
    durationFormatted: '3:50',
    hiddenTrackCount: 0,
    volume: 70,
    voiceChannelName: 'Synth Room',
    repeatModeLabel: 'off',
    autoplayEnabled: true,
    session: {
      stateLabel: 'ativa',
      healthLabel: 'saudavel',
      summary: 'A sessao esta coerente e sem bloqueios operacionais neste momento.',
      persistedItemCount: 1,
      liveItemCount: 1,
      recoveryReady: false,
      manualInterventionRequired: false,
      lastRecoveryLabel: 'sucesso',
      lastRecoverySummary: '1 restaurada(s) e 0 pulada(s)',
      currentRouteLabel: 'youtube/youtube-dl',
    },
  };
}

function createNowPlayingView(): NowPlayingView {
  return {
    kind: 'nowPlaying',
    title: 'PHONIX | Tocando agora',
    description: '**Night Drive** esta tocando agora em **Synth Room**.',
    track: {
      title: 'Night Drive',
      author: 'Nova',
      duration: '4:02',
      thumbnail: 'https://example.com/thumb.png',
      url: 'https://youtube.com/watch?v=night-drive',
      sourceLabel: 'YouTube',
    },
    progressBar: '[=====-----]',
    volume: 70,
    voiceChannelName: 'Synth Room',
    queueSize: 2,
    durationFormatted: '8:12',
    repeatModeLabel: 'off',
    autoplayEnabled: true,
    nextTrack: {
      position: 1,
      title: 'Orbit',
      duration: '3:50',
    },
    session: {
      stateLabel: 'ativa',
      healthLabel: 'saudavel',
      summary: 'A sessao esta coerente e sem bloqueios operacionais neste momento.',
      persistedItemCount: 2,
      liveItemCount: 2,
      recoveryReady: false,
      manualInterventionRequired: false,
      lastRecoveryLabel: 'sucesso',
      lastRecoverySummary: '2 restaurada(s) e 0 pulada(s)',
      currentRouteLabel: 'youtube/youtube-dl',
    },
  };
}

function createRecoverView(): RecoverView {
  return {
    kind: 'recover',
    variant: 'warning',
    title: 'PHONIX | Sessao restaurada com ressalvas',
    description: 'A sessao voltou para o seu canal, mas apenas **3** de **4** faixa(s) continuaram tocaveis.',
    track: {
      title: 'Night Drive',
      author: 'Nova',
      duration: '4:02',
      thumbnail: 'https://example.com/thumb.png',
      url: 'https://youtube.com/watch?v=night-drive',
      sourceLabel: 'YouTube',
    },
    summaryLines: ['Restauradas: **3**', 'Puladas: **1**'],
    settingsLines: ['Volume reaplicado: **82%**'],
    sessionLines: ['Saude: **parcial**'],
    hint: 'Use `/queue` para revisar a sessao.',
  };
}

function createCollectionView(): CollectionView {
  return {
    kind: 'collection',
    title: 'PHONIX | Seus favoritos',
    description: 'Voce tem **2** favorito(s) salvo(s).',
    collectionTitle: 'Favoritos salvos',
    leadTrack: {
      title: 'Night Drive',
      author: 'Nova',
      duration: '4:02',
      thumbnail: 'https://example.com/thumb.png',
      url: 'https://youtube.com/watch?v=night-drive',
      sourceLabel: 'YouTube',
    },
    entries: [
      {
        position: 1,
        title: 'Night Drive',
        subtitle: 'Nova',
        duration: '4:02',
        sourceLabel: 'YouTube',
        url: 'https://youtube.com/watch?v=night-drive',
      },
    ],
    hiddenEntryCount: 0,
    summaryTitle: 'Biblioteca pessoal',
    summaryLines: ['Favoritos salvos: **2**'],
    actionTitle: 'Fluxo rapido',
    actionLines: ['Use `/favorite play index:1`.'],
    hint: 'Use `/favorite play index:1` para tocar um favorito salvo.',
  };
}

function createHelpView(): HelpResultView {
  return {
    prefix: '!',
    currentPage: 'home',
    navigation: {
      guildId: 'guild-1',
      userId: 'user-1',
      currentPage: 'home',
      prefix: '!',
    },
    resumeQueueEnabled: true,
    hasActiveQueue: false,
    memberIsAdmin: false,
    memberIsOwner: false,
    pages: {
      home: {
        id: 'home',
        label: 'Inicio',
        title: 'PHONIX | Comece por aqui',
        description: 'Descricao inicial.',
        fields: [],
      },
      playback: {
        id: 'playback',
        label: 'Playback',
        title: 'PHONIX | Playback',
        description: 'Playback.',
        fields: [],
      },
      library: {
        id: 'library',
        label: 'Biblioteca',
        title: 'PHONIX | Biblioteca',
        description: 'Biblioteca.',
        fields: [],
      },
      recovery: {
        id: 'recovery',
        label: 'Recovery',
        title: 'PHONIX | Recovery',
        description: 'Recovery.',
        fields: [],
      },
      admin: {
        id: 'admin',
        label: 'Admin',
        title: 'PHONIX | Admin',
        description: 'Admin.',
        fields: [],
      },
    },
    sessionDiagnostics: createSessionDiagnostics(),
  };
}
