import { describe, expect, it } from 'vitest';
import { embeds } from '../../src/modules/ui/embeds.js';
import { theme } from '../../src/modules/ui/theme.js';
import { createSessionDiagnostics } from '../support/sessionDiagnostics.js';

describe('embed factory', () => {
  it('creates branded success embeds', () => {
    const embed = embeds.success('Titulo', 'Descricao').toJSON();
    expect(embed.color).toBe(theme.colors.electricBlue);
    expect(embed.title).toBe('Titulo');
    expect(embed.description).toBe('Descricao');
    expect(embed.author?.name).toContain('Sucesso operacional');
    expect(embed.fields?.some((field) => field.name === 'Resultado confirmado')).toBe(true);
  });

  it('creates visually distinct warning and error notices', () => {
    const warning = embeds.warning('Aviso', 'Descricao de aviso').toJSON();
    const error = embeds.error('Erro', 'Descricao de erro').toJSON();

    expect(warning.color).toBe(theme.colors.solarFlare);
    expect(warning.author?.name).toContain('Atencao operacional');
    expect(warning.fields?.some((field) => field.name === 'O que merece atencao')).toBe(true);
    expect(error.color).toBe(theme.colors.alertCoral);
    expect(error.author?.name).toContain('Erro controlado');
    expect(error.fields?.some((field) => field.name === 'O que bloqueou')).toBe(true);
    expect(error.fields?.some((field) => field.name === 'Como destravar agora')).toBe(true);
  });

  it('creates branded help embeds', () => {
    const embed = embeds
      .help({
        prefix: '!',
        currentPage: 'home',
        navigation: {
          guildId: 'guild-1',
          userId: 'user-1',
          currentPage: 'home',
          prefix: '!',
        },
        resumeQueueEnabled: true,
        hasActiveQueue: true,
        memberIsAdmin: false,
        memberIsOwner: false,
        pages: {
          home: {
            id: 'home',
            label: 'Inicio',
            title: 'PHONIX | Comece por aqui',
            description: 'Descricao inicial.',
            fields: [
              {
                name: 'Como comecar em 3 passos',
                value: '1. Entre em call.',
              },
            ],
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
        sessionDiagnostics: createSessionDiagnostics({
          state: 'pending',
          health: 'recoverable',
          healthDetail: 'Sessao persistida pronta para recover com 4 faixa(s).',
          hasPersistedSession: true,
          itemCount: 4,
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
          voiceChannelId: 'voice-1',
          textChannelId: 'text-1',
          lastSyncReason: 'recover',
          lastRecoveryTrigger: 'startup',
          lastRecoveryStatus: 'success',
          lastRecoveryAttemptAt: new Date('2026-04-02T00:00:00.000Z'),
          lastRecoveryAttempts: 1,
          lastRecoveryDurationMs: 1500,
          lastSuccessfulRecoveryAt: new Date('2026-04-02T00:00:00.000Z'),
          lastRecoveryRecoveredTrackCount: 4,
        }),
      })
      .toJSON();
    expect(embed.color).toBe(theme.colors.electricBlue);
    expect(embed.fields?.length).toBeGreaterThan(0);
    expect(embed.title).toBe('PHONIX | Comece por aqui');
    expect(embed.fields?.some((field) => field.name === 'Como comecar em 3 passos')).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Estado atual')).toBe(true);
  });

  it('creates guild settings embeds', () => {
    const embed = embeds
      .settings({
        settings: {
          prefix: '?',
          defaultVolume: 88,
          autoplayEnabled: true,
          resumeQueueEnabled: true,
        },
        sessionDiagnostics: createSessionDiagnostics({
          state: 'active',
          health: 'healthy',
          healthDetail: 'Fila ao vivo com 4 faixa(s) rastreadas nesta guild.',
          hasPersistedSession: true,
          hasActiveQueue: true,
          itemCount: 3,
          liveItemCount: 4,
          hasCurrentTrack: true,
          updatedAt: new Date('2026-04-02T00:00:00.000Z'),
          voiceChannelId: 'voice-1',
          textChannelId: 'text-1',
          lastSyncReason: 'playerStart',
          lastRecoveryTrigger: 'manual',
          lastRecoveryStatus: 'idle',
        }),
        liveVolume: 64,
      })
      .toJSON();

    expect(embed.title).toBe('PHONIX | Configuracoes do servidor');
    expect(embed.fields?.some((field) => field.name === 'Padroes do servidor' && field.value.includes('?'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Padroes do servidor' && field.value.includes('Resume queue'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Ajustes rapidos')).toBe(true);
  });

  it('creates dedicated play embeds with queue details', () => {
    const embed = embeds
      .playResult({
        kind: 'play',
        title: 'PHONIX | Faixa sera a proxima',
        description: 'A faixa entrou para tocar logo depois da atual.',
        track: {
          title: 'Orbit',
          author: 'Nova',
          duration: '4:00',
          thumbnail: 'https://example.com/thumb.png',
        },
        resultType: 'track',
        mode: 'next',
        source: 'YouTube',
        startedPlayback: false,
        addedCount: 1,
        requestedCount: 1,
        truncatedCount: 0,
        queuePosition: 1,
        estimatedWait: '2:15',
        voiceChannelName: 'Synth Room',
        autoplayEnabled: true,
        hint: 'Use /skip se quiser ir direto para a proxima faixa agora.',
      })
      .toJSON();

    expect(embed.title).toBe('PHONIX | Faixa sera a proxima');
    expect(embed.fields?.some((field) => field.name === 'Entrada na sessao' && field.value.includes('entra em seguida'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Origem e entrega' && field.value.includes('YouTube'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Fila e timing' && field.value.includes('Synth Room'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Fila e timing' && field.value.includes('2:15'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Origem e entrega' && field.value.includes('sim'))).toBe(true);
  });

  it('makes Spotify bridge explicit in dedicated play embeds', () => {
    const embed = embeds
      .playResult({
        kind: 'play',
        title: 'PHONIX | Tocando agora',
        description: 'A faixa comecou a tocar agora. O link do Spotify foi resolvido por bridge.',
        track: {
          title: 'After Dark',
          author: 'Metro',
          duration: '4:12',
          thumbnail: 'https://example.com/thumb.png',
        },
        resultType: 'track',
        mode: 'queue',
        source: 'Spotify',
        startedPlayback: true,
        addedCount: 1,
        requestedCount: 1,
        truncatedCount: 0,
        queuePosition: null,
        estimatedWait: null,
        voiceChannelName: 'Night Room',
        autoplayEnabled: false,
        sourceRouteKind: 'bridge',
        sourceDetail: 'Spotify hoje funciona por bridge: o link resolve metadados, mas o audio nao sai do source original do Spotify.',
        hint: 'Use /queue para ver a fila.',
      })
      .toJSON();

    expect(embed.fields?.some((field) => field.name === 'Origem e entrega' && field.value.includes('Spotify (bridge)'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Clareza de source' && field.value.includes('source original'))).toBe(true);
  });

  it('creates doctor report embeds', () => {
    const embed = embeds
      .doctor({
        appVersion: '2.1.0',
        overallStatus: 'warning',
        slashScope: 'global',
        dashboard: {
          requestedEnabled: true,
          effectiveEnabled: false,
          port: 3000,
          baseUrl: null,
          disableReason: 'faltam envs',
        },
        summary: {
          ok: 3,
          warning: 1,
          error: 0,
        },
        checks: [
          {
            label: 'Discord session',
            status: 'ok',
            detail: 'Cliente online.',
          },
          {
            label: 'Spotify',
            status: 'warning',
            detail: 'Credenciais ausentes.',
          },
        ],
        nextActions: ['Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET se quiser aceitar links do Spotify.'],
      })
      .toJSON();

    expect(embed.title).toBe('PHONIX | Diagnostico do sistema');
    expect(embed.description).toContain('v2.1.0');
    expect(embed.description).toContain('solicitado, mas indisponivel');
    expect(embed.fields?.some((field) => field.name === 'Runtime e deploy')).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Avisos ativos')).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Proximos passos')).toBe(true);
  });

  it('creates track cards with contextual fields and next-step hints', () => {
    const embed = embeds
      .trackCard(
        'PHONIX | Favorito salvo',
        {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
        },
        'A faixa entrou nos seus favoritos pessoais.',
        {
          fields: [
            {
              name: 'Origem do atalho',
              value: 'Busca ou URL informada manualmente por voce.',
            },
          ],
          hint: 'Use `/favorite list` para ver os indices ou `/favorite play index:1` para tocar depois.',
        },
      )
      .toJSON();

    expect(embed.fields?.some((field) => field.name === 'Origem do atalho')).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Proximo passo' && field.value.includes('/favorite play'))).toBe(true);
  });

  it('creates queue embeds with current track and session panel', () => {
    const embed = embeds
      .queueView({
        kind: 'queue',
        title: 'PHONIX | Fila ativa',
        description: 'Sessao ativa em **Synth Room**.',
        currentTrack: {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
        },
        currentProgressBar: '[=====-----]',
        upcomingTracks: [
          { position: 1, title: 'Orbit', duration: '3:50' },
          { position: 2, title: 'Skyline', duration: '4:10' },
        ],
        size: 2,
        durationFormatted: '8:00',
        hiddenTrackCount: 1,
        volume: 70,
        voiceChannelName: 'Synth Room',
        repeatModeLabel: 'autoplay',
        autoplayEnabled: true,
        session: {
          stateLabel: 'ativa',
          healthLabel: 'parcial',
          summary: 'A sessao voltou a tocar, mas 1 faixa ficou de fora durante o recovery.',
          persistedItemCount: 3,
          liveItemCount: 3,
          recoveryReady: false,
          manualInterventionRequired: false,
          lastRecoveryLabel: 'sucesso',
          lastRecoverySummary: '2 restaurada(s) e 1 pulada(s)',
          currentRouteLabel: 'youtube/youtube-dl',
        },
      })
      .toJSON();

    expect(embed.fields?.some((field) => field.name === 'Tocando agora' && field.value.includes('Night Drive'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Proximas faixas' && field.value.includes('...e mais **1** faixa(s)'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Session snapshot' && field.value.includes('Saude: **parcial**'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Recovery' && field.value.includes('youtube/youtube-dl'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Proximo passo')).toBe(true);
  });

  it('creates now playing embeds with next track and controls', () => {
    const embed = embeds
      .nowPlayingView({
        kind: 'nowPlaying',
        title: 'PHONIX | Tocando agora',
        description: '**Night Drive** esta tocando agora em **Synth Room**.',
        track: {
          title: 'Night Drive',
          author: 'Nova',
          duration: '4:02',
          thumbnail: 'https://example.com/thumb.png',
        },
        progressBar: '[=====-----]',
        volume: 70,
        voiceChannelName: 'Synth Room',
        queueSize: 3,
        durationFormatted: '11:20',
        repeatModeLabel: 'repetir fila',
        autoplayEnabled: false,
        nextTrack: {
          position: 1,
          title: 'Orbit',
          duration: '3:50',
        },
        session: {
          stateLabel: 'ativa',
          healthLabel: 'saudavel',
          summary: 'Fila ao vivo com 4 faixa(s) rastreadas nesta guild.',
          persistedItemCount: 4,
          liveItemCount: 4,
          recoveryReady: false,
          manualInterventionRequired: false,
          lastRecoveryLabel: 'sucesso',
          lastRecoverySummary: '4 restaurada(s) e 0 pulada(s)',
          currentRouteLabel: 'youtube/youtube-dl',
        },
      })
      .toJSON();

    expect(embed.fields?.some((field) => field.name === 'Proxima da fila' && field.value.includes('Orbit'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Playback agora' && field.value.includes('repetir fila'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Recovery' && field.value.includes('youtube/youtube-dl'))).toBe(true);
    expect(embed.fields?.some((field) => field.name === 'Proximo passo')).toBe(true);
  });
});
