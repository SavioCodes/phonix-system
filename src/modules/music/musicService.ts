import { DefaultExtractors, SoundCloudExtractor, SpotifyExtractor } from '@discord-player/extractor';
import {
  Player,
  type PlayerNodeInitializationResult,
  QueueRepeatMode,
  type GuildNodeCreateOptions,
  type GuildQueue,
  type SearchResult,
  type Track,
  type TrackLike,
} from 'discord-player';
import { YoutubeiExtractor } from 'discord-player-youtubei';
import { VoiceConnectionStatus } from 'discord-voip';
import {
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type Snowflake,
  type StageChannel,
  type VoiceChannel,
} from 'discord.js';
import { Log as YoutubeJsLog } from 'youtubei.js';
import { logger } from '../../core/logging/logger.js';
import { restoreTrack, type StoredTrack } from './trackCodec.js';
import type { AppConfig, YouTubeConfig, YouTubePlaybackProfile, YouTubeStreamClient } from '../../core/config/env.js';
import type { GuildSettingsService } from '../library/services/guildSettingsService.js';
import type { StoredPlaybackSession } from '../library/services/playbackSessionsService.js';
import type { PlaybackPipeline, PlaybackProvider } from './playbackFaults.js';
import { tryDeleteGuildQueue } from './queueLifecycle.js';

export interface QueueMetadata {
  textChannelId: Snowflake;
}

interface PlaybackStateOptions {
  volume: number;
  repeatMode: QueueRepeatMode;
}

export interface PlaybackRecoveryOutcome {
  queue: GuildQueue<QueueMetadata>;
  track: Track;
  requestedTrackCount: number;
  recoveredTrackCount: number;
  skippedTrackCount: number;
  restoredCurrentTrack: boolean;
  restoredUpcomingTrackCount: number;
  volume: number;
  repeatMode: QueueRepeatMode;
  autoplayEnabled: boolean;
}

export type PlaybackMode = 'queue' | 'next' | 'replace';
export type PlaybackSource = 'auto' | 'youtube' | 'spotify';
export type PlaybackSourceLabel = 'Auto' | 'YouTube' | 'Spotify';
export type PlaybackRouteKind = 'native' | 'bridge' | 'unknown';

interface PlaybackRequestOptions {
  mode?: PlaybackMode;
  forcedSource?: PlaybackSource;
}

export interface PlaybackOperationResult {
  queue: GuildQueue<QueueMetadata>;
  track: Track;
  searchResult: SearchResult;
  resultType: 'track' | 'playlist';
  mode: PlaybackMode;
  source: PlaybackSourceLabel;
  startedPlayback: boolean;
  addedCount: number;
  requestedCount: number;
  truncatedCount: number;
  queuePosition: number | null;
  estimatedWait: string | null;
  voiceChannelName: string | null;
  autoplayEnabled: boolean;
  hint: string | null;
  provider: PlaybackProvider;
  pipeline: PlaybackPipeline;
  routeKind: PlaybackRouteKind;
  entry: PlaybackEntryContext;
}

export interface PlaybackEntryContext {
  preparedVoiceConnection: boolean;
  reusedActiveQueue: boolean;
  awaitedPlaybackStart: boolean;
  compatibilityFallbackUsed: boolean;
}

export interface PlaybackRouteDescriptor {
  provider: PlaybackProvider;
  pipeline: PlaybackPipeline;
  routeKind: PlaybackRouteKind;
}

export interface ConfiguredPlaybackRoutes {
  youtube: PlaybackRouteDescriptor & {
    requestedProfile: YouTubePlaybackProfile;
    effectiveProfile: YouTubePlaybackProfile;
    downgradeReason: string | null;
    client: YouTubeStreamClient;
    highWaterMark: number | null;
    cookieConfigured: boolean;
    overrideBridgeMode: 'ytmusic' | null;
    useYoutubeDL: boolean;
    disablePlayer: boolean;
    generateWithPoToken: boolean;
  };
  spotify: PlaybackRouteDescriptor & {
    enabled: boolean;
  };
}

export interface ResolvedYouTubePlaybackProfile {
  requestedProfile: YouTubePlaybackProfile;
  effectiveProfile: YouTubePlaybackProfile;
  downgradeReason: string | null;
  streamClient: YouTubeStreamClient;
  cookie: string | null;
  cookieConfigured: boolean;
  highWaterMark: number | null;
  overrideBridgeMode: 'ytmusic' | null;
  useYoutubeDL: boolean;
  disablePlayer: boolean;
  generateWithPoToken: boolean;
  pipeline: PlaybackPipeline;
}

const MAX_QUEUE_SIZE = 100;
const MAX_HISTORY_SIZE = 20;
const DEFAULT_COMPATIBILITY_YOUTUBE_STREAM_CLIENT = 'ANDROID' as const;
const DEFAULT_FIDELITY_YOUTUBE_STREAM_CLIENT = 'WEB' as const;
const DEFAULT_FIDELITY_HIGH_WATER_MARK = 1_048_576;
export const VOICE_CONNECTION_TIMEOUT_MS = 45_000;
const PLAYBACK_START_TIMEOUT_MS = VOICE_CONNECTION_TIMEOUT_MS + 10_000;
const YOUTUBE_FIDELITY_PROBE_VIDEO_ID = 'jNQXAC9IVRw';

export class SpotifyCredentialsRequiredError extends Error {
  public constructor() {
    super('O source Spotify nao esta habilitado agora. Configure SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET ou use Auto/YouTube.');
    this.name = 'SpotifyCredentialsRequiredError';
  }
}

export class UserNotInVoiceChannelError extends Error {
  public constructor() {
    super('Entre em um canal de voz e repita o comando para o PHONIX tocar a musica.');
    this.name = 'UserNotInVoiceChannelError';
  }
}

export class BotInAnotherVoiceChannelError extends Error {
  public constructor(channelName: string) {
    super(`O PHONIX ja esta conectado em **${channelName}**. Entre nesse canal ou use /stop para encerrar a sessao atual.`);
    this.name = 'BotInAnotherVoiceChannelError';
  }
}

export class VoiceChannelPermissionError extends Error {
  public readonly missingPermissions: string[];

  public constructor(channelName: string, missingPermissions: string[]) {
    const formattedPermissions = missingPermissions.join(', ');
    super(`O PHONIX precisa de ${formattedPermissions} em **${channelName}** para tocar audio neste canal.`);
    this.name = 'VoiceChannelPermissionError';
    this.missingPermissions = missingPermissions;
  }
}

export class UnsupportedPlaybackUrlError extends Error {
  public readonly url: string;

  public constructor(url: string) {
    super('Essa URL nao e suportada pelo PHONIX agora. Use YouTube, Spotify ou uma busca em texto.');
    this.name = 'UnsupportedPlaybackUrlError';
    this.url = url;
  }
}

export class PlaybackSearchNoResultsError extends Error {
  public readonly provider: PlaybackProvider;
  public readonly pipeline: PlaybackPipeline;

  public constructor(
    message = 'Nao foi possivel encontrar uma faixa tocavel para essa busca ou URL. Tente outro termo ou envie um link direto.',
    provider: PlaybackProvider = 'unknown',
    pipeline: PlaybackPipeline = 'unknown',
  ) {
    super(message);
    this.name = 'PlaybackSearchNoResultsError';
    this.provider = provider;
    this.pipeline = pipeline;
  }
}

export class QueueCapacityReachedError extends Error {
  public constructor() {
    super(`A fila ja atingiu o limite de **${MAX_QUEUE_SIZE}** faixa(s) pendentes. Limpe a fila ou use /stop antes de adicionar mais.`);
    this.name = 'QueueCapacityReachedError';
  }
}

export class VoiceConnectionTimeoutError extends Error {
  public constructor() {
    super('O PHONIX nao conseguiu conectar ao canal de voz a tempo. Verifique se o bot pode entrar e falar no canal e tente novamente.');
    this.name = 'VoiceConnectionTimeoutError';
  }
}

export class PlaybackUnavailableError extends Error {
  public readonly provider: PlaybackProvider;
  public readonly pipeline: PlaybackPipeline;

  public constructor(
    message = 'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
    provider: PlaybackProvider = 'unknown',
    pipeline: PlaybackPipeline = 'unknown',
  ) {
    super(message);
    this.name = 'PlaybackUnavailableError';
    this.provider = provider;
    this.pipeline = pipeline;
  }
}

interface PlaybackFailureRouteContext {
  provider?: PlaybackProvider;
  pipeline?: PlaybackPipeline;
}

interface PlaybackStartResult {
  result: PlayerNodeInitializationResult<QueueMetadata>;
  awaitedPlaybackStart: boolean;
  compatibilityFallbackUsed: boolean;
}

export class MusicService {
  private youtubeRuntimeCompatibilityReason: string | null = null;

  public constructor(
    public readonly player: Player,
    private readonly config: AppConfig,
    private readonly guildSettings: GuildSettingsService,
  ) {}

  public async setupExtractors() {
    YoutubeJsLog.setLevel(YoutubeJsLog.Level.ERROR);
    const youtubeProfile = this.getActiveYouTubeProfile();

    const curatedDefaultExtractors = DefaultExtractors.filter(
      (extractor) => extractor !== SpotifyExtractor && extractor !== SoundCloudExtractor,
    );
    await this.player.extractors.loadMulti(curatedDefaultExtractors);
    await this.player.extractors.register(YoutubeiExtractor, buildYoutubeExtractorOptions(this.config.youtube));

    if (this.config.spotify.enabled) {
      await this.player.extractors.register(SpotifyExtractor, {
        clientId: this.config.spotify.clientId,
        clientSecret: this.config.spotify.clientSecret,
      });
    }

    const routes = this.describePlaybackRoutes();
    logger.info(
      {
        spotifyEnabled: this.config.spotify.enabled,
        youtubeProfileRequested: routes.youtube.requestedProfile,
        youtubeProfileEffective: routes.youtube.effectiveProfile,
        youtubeProfileDowngradeReason: routes.youtube.downgradeReason,
        youtubeClient: routes.youtube.client,
        youtubeHighWaterMark: routes.youtube.highWaterMark,
        youtubeCookieConfigured: routes.youtube.cookieConfigured,
        youtubeExtractor: 'youtubei',
        youtubeStreamPipeline: routes.youtube.pipeline,
        youtubeRouteKind: 'native',
        youtubeBridgeMode: routes.youtube.overrideBridgeMode ?? 'none',
        youtubePlayerDisabled: routes.youtube.disablePlayer,
        youtubeGenerateWithPoToken: routes.youtube.generateWithPoToken,
        spotifyRouteKind: this.config.spotify.enabled ? 'bridge' : 'unknown',
      },
      'Music extractors configured',
    );
  }

  public async stabilizeYoutubeRuntime() {
    const activeProfile = this.getActiveYouTubeProfile();
    if (activeProfile.effectiveProfile !== 'fidelity' || this.youtubeRuntimeCompatibilityReason) {
      return false;
    }

    const extractor = this.player.extractors?.get?.(YoutubeiExtractor.identifier) as YoutubeiExtractor | undefined;
    if (!extractor?.innerTube) {
      return false;
    }

    try {
      const info = await extractor.innerTube.getBasicInfo(YOUTUBE_FIDELITY_PROBE_VIDEO_ID, {
        client: activeProfile.streamClient,
      });
      const stream = await info.download({
        type: 'audio',
        quality: 'best',
        client: activeProfile.streamClient,
      });
      const reader = stream.getReader();
      try {
        await reader.read();
      } finally {
        await reader.cancel().catch(() => undefined);
      }

      logger.info(
        {
          youtubeProfileRequested: activeProfile.requestedProfile,
          youtubeProfileEffective: activeProfile.effectiveProfile,
          youtubePipeline: activeProfile.pipeline,
          youtubeClient: activeProfile.streamClient,
          youtubeGenerateWithPoToken: activeProfile.generateWithPoToken,
          probeVideoId: YOUTUBE_FIDELITY_PROBE_VIDEO_ID,
        },
        'YouTube fidelity runtime probe succeeded',
      );
      return false;
    } catch (error) {
      return this.activateYoutubeCompatibilityFallback(
        `Probe de startup do YouTube/youtubei falhou: ${formatRuntimeProbeError(error)}`,
      );
    }
  }

  public describePlaybackRoutes(): ConfiguredPlaybackRoutes {
    const routes = describeConfiguredPlaybackRoutes(this.config.spotify.enabled, this.config.youtube);
    const youtube = this.getActiveYouTubeProfile();

    return {
      ...routes,
      youtube: {
        ...routes.youtube,
        effectiveProfile: youtube.effectiveProfile,
        downgradeReason: youtube.downgradeReason,
        client: youtube.streamClient,
        highWaterMark: youtube.highWaterMark,
        cookieConfigured: youtube.cookieConfigured,
        overrideBridgeMode: youtube.overrideBridgeMode,
        useYoutubeDL: youtube.useYoutubeDL,
        disablePlayer: youtube.disablePlayer,
        generateWithPoToken: youtube.generateWithPoToken,
        pipeline: youtube.pipeline,
      },
    };
  }

  public inferTrackRoute(track?: Partial<Track> | null): PlaybackRouteDescriptor {
    const route = inferTrackPlaybackRoute(track, this.getActiveYouTubeConfig());
    if (route.provider === 'youtube') {
      return {
        ...route,
        pipeline: this.getActiveYouTubeProfile().pipeline,
        routeKind: 'native',
      };
    }

    return route;
  }

  public async join(member: GuildMember, metadata: QueueMetadata) {
    const voiceChannel = await this.ensurePlayableVoiceChannel(member);
    const queue = await this.ensureQueue(member.guild, metadata);

    if (!hasHealthyVoiceConnection(queue)) {
      await queue.connect(voiceChannel, buildVoiceConnectionOptions());
    }

    queue.setMetadata(metadata);
    return queue;
  }

  public async play(
    voiceChannel: VoiceChannel | StageChannel,
    query: TrackLike,
    requestedBy: GuildMember['user'],
    metadata: QueueMetadata,
  options: PlaybackRequestOptions = {},
  ): Promise<PlaybackOperationResult> {
    const mode = options.mode ?? 'queue';
    const preRequestQueue = this.player.nodes.get<QueueMetadata>(voiceChannel.guild.id);
    const hadHealthyVoiceConnectionBeforeRequest = preRequestQueue ? hasHealthyVoiceConnection(preRequestQueue) : false;
    const hadActiveQueueBeforeRequest = Boolean(preRequestQueue?.currentTrack);

    if (typeof query !== 'string') {
      const normalizedQuery = normalizePlayableQuery(query);
      const playbackResult = await this.playWithState(
        voiceChannel,
        normalizedQuery,
        requestedBy.id,
        metadata,
        undefined,
        inferPlaybackRouteFromTrackLike(normalizedQuery),
      );
      const activeRoute = this.inferTrackRoute(playbackResult.result.track);
      return this.buildPlaybackOperationResult({
        queue: playbackResult.result.queue,
        searchResult: playbackResult.result.searchResult,
        track: playbackResult.result.track,
        mode,
        source: 'Auto',
        addedCount: 1,
        requestedCount: 1,
        voiceChannelName: voiceChannel.name,
        provider: activeRoute.provider,
        pipeline: activeRoute.pipeline,
        routeKind: activeRoute.routeKind,
        entry: {
          preparedVoiceConnection: !hadHealthyVoiceConnectionBeforeRequest,
          reusedActiveQueue: hadActiveQueueBeforeRequest,
          awaitedPlaybackStart: playbackResult.awaitedPlaybackStart,
          compatibilityFallbackUsed: playbackResult.compatibilityFallbackUsed,
        },
      });
    }

    const resolved = await this.searchPlayableQuery(query, requestedBy.id, options.forcedSource ?? 'auto');
    const requestedTracks = selectTracksForQueueInsertion(resolved.searchResult);
    const requestedCount = requestedTracks.length;
    const activeQueue = preRequestQueue;
    const hasCurrentTrack = Boolean(activeQueue?.currentTrack);
    const acceptedTracks = trimTracksForPlayback(requestedTracks, {
      queue: activeQueue,
      mode,
      hasCurrentTrack,
    });
    const playbackPayload = toPlaybackPayload(acceptedTracks);

    if (mode === 'replace') {
      if (activeQueue) {
        tryDeleteGuildQueue(activeQueue);
      }

      const playbackResult = await this.playWithState(
        voiceChannel,
        playbackPayload,
        requestedBy.id,
        metadata,
        undefined,
        {
          provider: resolved.provider,
          pipeline: resolved.pipeline,
        },
      );
      const activeRoute = this.inferTrackRoute(acceptedTracks[0]);
      return this.buildPlaybackOperationResult({
        queue: playbackResult.result.queue,
        searchResult: resolved.searchResult,
        track: acceptedTracks[0],
        mode,
        source: resolved.source,
        addedCount: acceptedTracks.length,
        requestedCount,
        voiceChannelName: voiceChannel.name,
        provider: activeRoute.provider,
        pipeline: activeRoute.pipeline,
        routeKind: activeRoute.routeKind,
        entry: {
          preparedVoiceConnection: !hadHealthyVoiceConnectionBeforeRequest,
          reusedActiveQueue: hadActiveQueueBeforeRequest,
          awaitedPlaybackStart: playbackResult.awaitedPlaybackStart,
          compatibilityFallbackUsed: playbackResult.compatibilityFallbackUsed,
        },
      });
    }

    if (hasCurrentTrack && activeQueue) {
      if (!hadHealthyVoiceConnectionBeforeRequest) {
        await activeQueue.connect(voiceChannel, buildVoiceConnectionOptions());
      }

      activeQueue.setMetadata(metadata);

      if (mode === 'next') {
        for (const track of acceptedTracks.slice().reverse()) {
          activeQueue.insertTrack(track, 0);
        }
      } else {
        activeQueue.addTrack(acceptedTracks.length === 1 ? acceptedTracks[0] : acceptedTracks);
      }

      return this.buildPlaybackOperationResult({
        queue: activeQueue,
        searchResult: resolved.searchResult,
        track: acceptedTracks[0],
        mode,
        source: resolved.source,
        addedCount: acceptedTracks.length,
        requestedCount,
        voiceChannelName: voiceChannel.name,
        provider: resolved.provider,
        pipeline: resolved.pipeline,
        routeKind: resolved.routeKind,
        entry: {
          preparedVoiceConnection: !hadHealthyVoiceConnectionBeforeRequest,
          reusedActiveQueue: true,
          awaitedPlaybackStart: false,
          compatibilityFallbackUsed: false,
        },
      });
    }

    const playbackResult = await this.playWithState(
      voiceChannel,
      playbackPayload,
      requestedBy.id,
      metadata,
      undefined,
      {
        provider: resolved.provider,
        pipeline: resolved.pipeline,
      },
    );
    const activeRoute = this.inferTrackRoute(acceptedTracks[0]);
    return this.buildPlaybackOperationResult({
      queue: playbackResult.result.queue,
      searchResult: resolved.searchResult,
      track: acceptedTracks[0],
      mode,
      source: resolved.source,
      addedCount: acceptedTracks.length,
      requestedCount,
      voiceChannelName: voiceChannel.name,
      provider: activeRoute.provider,
      pipeline: activeRoute.pipeline,
      routeKind: activeRoute.routeKind,
      entry: {
        preparedVoiceConnection: !hadHealthyVoiceConnectionBeforeRequest,
        reusedActiveQueue: hadActiveQueueBeforeRequest,
        awaitedPlaybackStart: playbackResult.awaitedPlaybackStart,
        compatibilityFallbackUsed: playbackResult.compatibilityFallbackUsed,
      },
    });
  }

  public async playStoredTracks(
    voiceChannel: VoiceChannel | StageChannel,
    tracks: StoredTrack[],
    requestedBy: GuildMember['user'],
    metadata: QueueMetadata,
  ): Promise<PlayerNodeInitializationResult<QueueMetadata>> {
    if (tracks.length === 0) {
      throw new Error('Nao ha faixas salvas para tocar.');
    }

    const payload =
      tracks.length === 1 ? await this.resolvePlayableTrack(tracks[0], requestedBy.id) : await this.resolvePlayableTracks(tracks, requestedBy.id);

    const playbackResult = await this.playWithState(
      voiceChannel,
      payload,
      requestedBy.id,
      metadata,
      undefined,
      inferPlaybackRouteFromTrackLike(payload),
    );

    return playbackResult.result;
  }

  public async recoverPlaybackSession(
    voiceChannel: VoiceChannel | StageChannel,
    session: StoredPlaybackSession,
    requestedById: string,
    metadata: QueueMetadata,
  ): Promise<PlaybackRecoveryOutcome> {
    const storedTracks = [session.currentTrack, ...session.items.map((item) => item.track)].filter(Boolean) as StoredTrack[];
    if (storedTracks.length === 0) {
      throw new PlaybackUnavailableError('A sessao salva nao tem faixas para recuperar.');
    }

    const resolution = await this.resolvePlayableTracksBestEffort(storedTracks, requestedById);
    if (resolution.tracks.length === 0) {
      throw new PlaybackUnavailableError('Nenhuma faixa salva continua tocavel. A sessao antiga sera descartada.');
    }

    const repeatMode = normalizeRepeatMode(session.repeatMode, session.autoplayEnabled);
    const playbackResult = await this.playWithState(
      voiceChannel,
      resolution.tracks.length === 1 ? resolution.tracks[0] : resolution.tracks,
      requestedById,
      metadata,
      {
        volume: session.volume,
        repeatMode,
      },
      inferPlaybackRouteFromTrackLike(resolution.tracks),
    );

    const queue = this.player.nodes.get<QueueMetadata>(voiceChannel.guild.id);
    if (!queue) {
      throw new PlaybackUnavailableError('A fila recuperada nao ficou disponivel apos restaurar a sessao.');
    }

    queue.node.setVolume(session.volume);
    queue.setRepeatMode(repeatMode);

    return {
      queue,
      track: playbackResult.result.track,
      requestedTrackCount: storedTracks.length,
      recoveredTrackCount: resolution.tracks.length,
      skippedTrackCount: storedTracks.length - resolution.tracks.length,
      restoredCurrentTrack: resolution.restoredCurrentTrack,
      restoredUpcomingTrackCount: resolution.tracks.length - Number(resolution.restoredCurrentTrack),
      volume: session.volume,
      repeatMode,
      autoplayEnabled: repeatMode === QueueRepeatMode.AUTOPLAY,
    };
  }

  public async ensureQueue(
    guild: Guild,
    metadata: QueueMetadata,
    playbackState?: PlaybackStateOptions,
  ): Promise<GuildQueue<QueueMetadata>> {
    const existingQueue = this.player.nodes.get<QueueMetadata>(guild.id);
    if (existingQueue && shouldResetQueue(existingQueue)) {
      tryDeleteGuildQueue(existingQueue);
    }

    const repeatMode =
      playbackState?.repeatMode ??
      ((await this.guildSettings.isAutoplayEnabled(guild.id)) ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
    const volume = playbackState?.volume ?? (await this.guildSettings.getDefaultVolume(guild.id));
    const queue = this.player.nodes.create<QueueMetadata>(guild.id, buildGuildNodeOptions(metadata, volume, repeatMode));

    queue.setMetadata(metadata);
    return queue;
  }

  public requireMemberVoiceChannel(member: GuildMember): VoiceChannel | StageChannel {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) {
      throw new UserNotInVoiceChannelError();
    }

    return voiceChannel as VoiceChannel | StageChannel;
  }

  public ensureSameVoiceChannel(member: GuildMember): VoiceChannel | StageChannel {
    const voiceChannel = this.requireMemberVoiceChannel(member);
    const queue = this.player.nodes.get<QueueMetadata>(member.guild.id);

    if (queue && shouldResetQueue(queue)) {
      tryDeleteGuildQueue(queue);
      return voiceChannel;
    }

    if (queue?.channel && queue.channel.id !== voiceChannel.id) {
      throw new BotInAnotherVoiceChannelError(queue.channel.name);
    }

    return voiceChannel;
  }

  public async ensurePlayableVoiceChannel(member: GuildMember): Promise<VoiceChannel | StageChannel> {
    const voiceChannel = this.ensureSameVoiceChannel(member);
    const botMember = await this.getBotMember(member.guild);

    if (!botMember) {
      return voiceChannel;
    }

    const permissions = voiceChannel.permissionsFor(botMember);
    const missingPermissions: string[] = [];

    if (!permissions?.has(PermissionFlagsBits.ViewChannel)) {
      missingPermissions.push('Ver canal');
    }

    if (!permissions?.has(PermissionFlagsBits.Connect)) {
      missingPermissions.push('Conectar');
    }

    if (!permissions?.has(PermissionFlagsBits.Speak)) {
      missingPermissions.push('Falar');
    }

    if (missingPermissions.length > 0) {
      throw new VoiceChannelPermissionError(voiceChannel.name, missingPermissions);
    }

    return voiceChannel;
  }

  public resolveSearchEngine(query: string, forcedSource: PlaybackSource = 'auto') {
    const normalizedQuery = normalizePlayableQuery(query);

    if (typeof normalizedQuery === 'string' && isSpotifyUrl(normalizedQuery)) {
      if (!this.config.spotify.enabled) {
        throw new SpotifyCredentialsRequiredError();
      }

      return `ext:${SpotifyExtractor.identifier}` as const;
    }

    if (typeof normalizedQuery === 'string' && isYouTubeUrl(normalizedQuery)) {
      return `ext:${YoutubeiExtractor.identifier}` as const;
    }

    if (forcedSource === 'spotify') {
      if (!this.config.spotify.enabled) {
        throw new SpotifyCredentialsRequiredError();
      }

      return `ext:${SpotifyExtractor.identifier}` as const;
    }

    return `ext:${YoutubeiExtractor.identifier}` as const;
  }

  public async setAutoplay(guildId: string, enabled: boolean) {
    await this.guildSettings.setAutoplay(guildId, enabled);

    const queue = this.player.nodes.get<QueueMetadata>(guildId);
    if (queue) {
      queue.setRepeatMode(enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
    }
  }

  private async resolvePlayableTrack(storedTrack: StoredTrack, requestedById: string): Promise<Track> {
    const restored = restoreTrack(this.player, storedTrack);
    if (typeof restored !== 'string') {
      return restored;
    }

    const normalizedUrl = normalizePlayableQuery(storedTrack.url);
    const searchResult = await this.player.search(normalizedUrl, {
      requestedBy: requestedById,
      searchEngine: this.resolveSearchEngine(typeof normalizedUrl === 'string' ? normalizedUrl : storedTrack.url),
    });

    if (searchResult.isEmpty() || searchResult.tracks.length === 0) {
      throw new Error(`Nao foi possivel reconstruir a faixa salva: ${storedTrack.title}.`);
    }

    return searchResult.tracks[0] as Track;
  }

  private async resolvePlayableTracks(tracks: StoredTrack[], requestedById: string): Promise<Track[]> {
    return Promise.all(tracks.map((track) => this.resolvePlayableTrack(track, requestedById)));
  }

  private async resolvePlayableTracksBestEffort(tracks: StoredTrack[], requestedById: string) {
    const playableTracks: Track[] = [];
    let restoredCurrentTrack = false;

    for (const [index, track] of tracks.entries()) {
      try {
        playableTracks.push(await this.resolvePlayableTrack(track, requestedById));
        if (index === 0) {
          restoredCurrentTrack = true;
        }
      } catch (error) {
        logger.warn(
          {
            title: track.title,
            url: track.url,
            err: error,
          },
          'Stored track could not be restored during playback recovery',
        );
      }
    }

    return {
      tracks: playableTracks,
      restoredCurrentTrack,
    };
  }

  private async searchPlayableQuery(query: string, requestedById: string, forcedSource: PlaybackSource) {
    const normalizedQuery = normalizePlayableQuery(query);
    const normalizedText = typeof normalizedQuery === 'string' ? normalizedQuery : query;

    if (!normalizedText) {
      throw new PlaybackSearchNoResultsError('Informe o nome da musica ou uma URL para o PHONIX tocar.', 'unknown', 'unknown');
    }

    if (looksLikeHttpUrl(normalizedText) && !isYouTubeUrl(normalizedText) && !isSpotifyUrl(normalizedText)) {
      throw new UnsupportedPlaybackUrlError(normalizedText);
    }

    const { provider, pipeline, routeKind } = inferSearchRoute(normalizedText, forcedSource, this.getActiveYouTubeConfig());
    const searchResult = await this.player.search(normalizedQuery, {
      requestedBy: requestedById,
      searchEngine: this.resolveSearchEngine(normalizedText, forcedSource),
    });

    if (searchResult.isEmpty() || searchResult.tracks.length === 0) {
      throw new PlaybackSearchNoResultsError(
        'Nao foi possivel encontrar uma faixa tocavel para essa busca ou URL. Tente outra busca ou use uma URL direta.',
        provider,
        pipeline,
      );
    }

    return {
      searchResult,
      source: resolvePlaybackSourceLabel(normalizedText, forcedSource),
      provider,
      pipeline,
      routeKind,
    };
  }

  private buildPlaybackOperationResult(input: {
    queue: GuildQueue<QueueMetadata>;
    searchResult: SearchResult;
    track: Track;
    mode: PlaybackMode;
    source: PlaybackSourceLabel;
    addedCount: number;
    requestedCount: number;
    voiceChannelName: string | null;
    provider: PlaybackProvider;
    pipeline: PlaybackPipeline;
    routeKind: PlaybackRouteKind;
    entry: PlaybackEntryContext;
  }): PlaybackOperationResult {
    const startedPlayback = input.queue.currentTrack?.id === input.track.id;

    return {
      queue: input.queue,
      track: input.track,
      searchResult: input.searchResult,
      resultType: input.searchResult.hasPlaylist() ? 'playlist' : 'track',
      mode: input.mode,
      source: input.source,
      startedPlayback,
      addedCount: input.addedCount,
      requestedCount: input.requestedCount,
      truncatedCount: Math.max(input.requestedCount - input.addedCount, 0),
      queuePosition: startedPlayback ? null : findTrackQueuePosition(input.queue, input.track),
      estimatedWait: startedPlayback ? null : formatWaitDuration(calculateEstimatedWaitMs(input.queue, input.track)),
      voiceChannelName: input.queue.channel?.name ?? input.voiceChannelName,
      autoplayEnabled: input.queue.repeatMode === QueueRepeatMode.AUTOPLAY,
      hint: buildPlaybackHint({
        mode: input.mode,
        startedPlayback,
        resultType: input.searchResult.hasPlaylist() ? 'playlist' : 'track',
        truncatedCount: Math.max(input.requestedCount - input.addedCount, 0),
      }),
      provider: input.provider,
      pipeline: input.pipeline,
      routeKind: input.routeKind,
      entry: input.entry,
    };
  }

  private async getBotMember(guild: Guild) {
    const members = guild.members;
    if (!members) {
      return null;
    }

    if (members.me) {
      return members.me;
    }

    if (typeof members.fetchMe === 'function') {
      try {
        return await members.fetchMe();
      } catch {
        return null;
      }
    }

    return null;
  }

  private async playWithState(
    voiceChannel: VoiceChannel | StageChannel,
    query: TrackLike,
    requestedById: string,
    metadata: QueueMetadata,
    playbackState?: PlaybackStateOptions,
    failureRouteContext?: PlaybackFailureRouteContext,
    allowCompatibilityRetry = true,
  ): Promise<PlaybackStartResult> {
    const queue = await this.ensureQueue(voiceChannel.guild, metadata, playbackState);
    const shouldAwaitPlaybackStart = !queue.isPlaying();
    const playbackFailureContext = failureRouteContext ?? this.inferPlaybackFailureRoute(query);
    const playbackWatcher =
      shouldAwaitPlaybackStart && this.player.events
        ? this.createPlaybackStartWatcher(voiceChannel.guild.id, playbackFailureContext)
        : undefined;
    const searchEngine = typeof query === 'string' ? this.resolveSearchEngine(query) : undefined;
    const repeatMode =
      playbackState?.repeatMode ??
      ((await this.guildSettings.isAutoplayEnabled(voiceChannel.guild.id)) ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
    const volume = playbackState?.volume ?? (await this.guildSettings.getDefaultVolume(voiceChannel.guild.id));

    try {
      const result = await this.player.play(voiceChannel, query, {
        requestedBy: requestedById,
        searchEngine,
        connectionOptions: buildVoiceConnectionOptions(),
        nodeOptions: {
          ...buildGuildNodeOptions(queue.metadata ?? metadata, volume, repeatMode),
        },
      });

      if (playbackWatcher) {
        await playbackWatcher.promise;
      }

      return {
        result,
        awaitedPlaybackStart: shouldAwaitPlaybackStart,
        compatibilityFallbackUsed: false,
      };
    } catch (error) {
      playbackWatcher?.dispose();
      try {
        cleanupFailedPlaybackQueue(queue);
      } catch (cleanupError) {
        logger.warn(
          {
            guildId: voiceChannel.guild.id,
            err: cleanupError,
          },
          'Failed to dispose an empty queue after playback startup failure',
        );
      }
      const normalizedError = normalizePlaybackError(error, playbackFailureContext);
      if (
        allowCompatibilityRetry &&
        this.shouldRetryWithYoutubeCompatibility(normalizedError, playbackFailureContext) &&
        this.activateYoutubeCompatibilityFallback(normalizedError.message)
      ) {
        const retryResult = await this.playWithState(voiceChannel, query, requestedById, metadata, playbackState, undefined, false);
        return {
          ...retryResult,
          compatibilityFallbackUsed: true,
        };
      }

      throw normalizedError;
    }
  }

  private inferPlaybackFailureRoute(query: TrackLike): PlaybackFailureRouteContext | undefined {
    return inferPlaybackRouteFromTrackLike(query, this.getActiveYouTubeConfig());
  }

  private shouldRetryWithYoutubeCompatibility(error: Error, failureRouteContext?: PlaybackFailureRouteContext) {
    if (this.youtubeRuntimeCompatibilityReason) {
      return false;
    }

    const youtubeProfile = this.getActiveYouTubeProfile();
    if (youtubeProfile.effectiveProfile !== 'fidelity') {
      return false;
    }

    const normalizedError =
      error instanceof PlaybackUnavailableError ? error : normalizePlaybackError(error, failureRouteContext);

    return normalizedError instanceof PlaybackUnavailableError && normalizedError.provider === 'youtube' && normalizedError.pipeline === 'youtubei';
  }

  private activateYoutubeCompatibilityFallback(reason: string) {
    const extractor = this.player.extractors?.get?.(YoutubeiExtractor.identifier) as YoutubeiExtractor | undefined;
    if (!extractor) {
      return false;
    }

    const compatibilityProfile = resolveRuntimeYouTubePlaybackProfile(
      this.config.youtube,
      'Runtime degradado para compatibility depois de falha real no pipeline fidelity/youtubei.',
    );

    extractor.setClientMode(compatibilityProfile.streamClient);
    if (!extractor.options.streamOptions) {
      extractor.options.streamOptions = {};
    }
    extractor.options.streamOptions.useClient = compatibilityProfile.streamClient;
    if (compatibilityProfile.highWaterMark) {
      extractor.options.streamOptions.highWaterMark = compatibilityProfile.highWaterMark;
    } else {
      delete extractor.options.streamOptions.highWaterMark;
    }
    extractor.options.useYoutubeDL = compatibilityProfile.useYoutubeDL;
    extractor.options.disablePlayer = compatibilityProfile.disablePlayer;
    extractor.options.generateWithPoToken = compatibilityProfile.generateWithPoToken;
    if (compatibilityProfile.overrideBridgeMode) {
      extractor.options.overrideBridgeMode = compatibilityProfile.overrideBridgeMode;
    } else {
      delete extractor.options.overrideBridgeMode;
    }

    this.youtubeRuntimeCompatibilityReason = compatibilityProfile.downgradeReason;
    logger.warn(
        {
          reason,
          youtubeProfileRequested: this.config.youtube?.profile ?? 'compatibility',
          youtubeProfileEffective: compatibilityProfile.effectiveProfile,
          youtubePipeline: compatibilityProfile.pipeline,
          youtubeClient: compatibilityProfile.streamClient,
          youtubeGenerateWithPoToken: compatibilityProfile.generateWithPoToken,
        },
      'YouTube fidelity stream failed; PHONIX downgraded the runtime to compatibility',
    );
    return true;
  }

  private getActiveYouTubeConfig(): YouTubeConfig | undefined {
    if (!this.youtubeRuntimeCompatibilityReason) {
      return this.config.youtube;
    }

    return {
      ...this.config.youtube,
      profile: 'compatibility',
    };
  }

  private getActiveYouTubeProfile() {
    return resolveRuntimeYouTubePlaybackProfile(this.config.youtube, this.youtubeRuntimeCompatibilityReason);
  }

  private createPlaybackStartWatcher(guildId: string, failureRouteContext?: PlaybackFailureRouteContext) {
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const cleanup = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }

      this.player.events.off('playerStart', onPlayerStart);
      this.player.events.off('error', onQueueError);
      this.player.events.off('playerError', onPlayerError);
    };

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      callback();
    };

    const onPlayerStart = (queue: GuildQueue<QueueMetadata>) => {
      if (queue.guild.id !== guildId) {
        return;
      }

      settle(() => resolvePromise());
    };

    const onQueueError = (queue: GuildQueue<QueueMetadata>, error: Error) => {
      if (queue.guild.id !== guildId) {
        return;
      }

      settle(() => rejectPromise(normalizePlaybackError(error, inferPlaybackRouteFromTrack(queue.currentTrack) ?? failureRouteContext)));
    };

    const onPlayerError = (queue: GuildQueue<QueueMetadata>, error: Error) => {
      if (queue.guild.id !== guildId) {
        return;
      }

      settle(() => rejectPromise(normalizePlaybackError(error, inferPlaybackRouteFromTrack(queue.currentTrack) ?? failureRouteContext)));
    };

    let resolvePromise = () => {};
    let rejectPromise = (_error: Error) => {};

    const promise = new Promise<void>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      timeout = setTimeout(() => {
        settle(() => reject(new VoiceConnectionTimeoutError()));
      }, PLAYBACK_START_TIMEOUT_MS);
    });

    this.player.events.on('playerStart', onPlayerStart);
    this.player.events.on('error', onQueueError);
    this.player.events.on('playerError', onPlayerError);

    return {
      promise,
      dispose() {
        settle(() => {});
      },
    };
  }
}

function isSpotifyUrl(query: string) {
  return /(?:open\.spotify\.com|spotify:)/iu.test(query);
}

function looksLikeHttpUrl(query: string) {
  try {
    const url = new URL(query);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isYouTubeUrl(query: string) {
  try {
    const url = new URL(query);
    const hostname = url.hostname.replace(/^www\./u, '').toLowerCase();
    return ['youtu.be', 'youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname);
  } catch {
    return false;
  }
}

export function buildGuildNodeOptions(
  metadata: QueueMetadata,
  volume: number,
  repeatMode: QueueRepeatMode,
): GuildNodeCreateOptions<QueueMetadata> {
  return {
    metadata,
    volume,
    repeatMode,
    maxSize: MAX_QUEUE_SIZE,
    maxHistorySize: MAX_HISTORY_SIZE,
    selfDeaf: true,
    connectionTimeout: VOICE_CONNECTION_TIMEOUT_MS,
    leaveOnEnd: true,
    leaveOnEndCooldown: 15_000,
    leaveOnEmpty: true,
    leaveOnEmptyCooldown: 30_000,
    leaveOnStop: true,
    leaveOnStopCooldown: 5_000,
  } satisfies GuildNodeCreateOptions<QueueMetadata>;
}

export function buildVoiceConnectionOptions() {
  return {
    daveEncryption: true,
    timeout: VOICE_CONNECTION_TIMEOUT_MS,
  } as const;
}

export function buildYoutubeExtractorOptions(youtubeConfig?: YouTubeConfig) {
  const resolved = resolveYouTubePlaybackProfile(youtubeConfig);
  return {
    disablePlayer: resolved.disablePlayer,
    useYoutubeDL: resolved.useYoutubeDL,
    generateWithPoToken: resolved.generateWithPoToken,
    logLevel: 'NONE',
    streamOptions: {
      useClient: resolved.streamClient,
      ...(resolved.highWaterMark ? { highWaterMark: resolved.highWaterMark } : {}),
    },
    ...(resolved.cookie ? { cookie: resolved.cookie } : {}),
    ...(resolved.overrideBridgeMode ? { overrideBridgeMode: resolved.overrideBridgeMode } : {}),
  } as const;
}

export function resolveYouTubePlaybackProfile(youtubeConfig?: YouTubeConfig): ResolvedYouTubePlaybackProfile {
  const requestedProfile = youtubeConfig?.profile ?? 'compatibility';
  const cookie = youtubeConfig?.cookie?.trim() ? youtubeConfig.cookie.trim() : null;
  const cookieConfigured = Boolean(cookie);
  const effectiveProfile = requestedProfile === 'fidelity' && cookieConfigured ? 'fidelity' : 'compatibility';
  const downgradeReason =
    requestedProfile === 'fidelity' && !cookieConfigured
      ? 'YOUTUBE_COOKIE ausente. O PHONIX manteve o perfil compatibility para preservar estabilidade.'
      : null;
  const streamClient =
    youtubeConfig?.streamClient ??
    (effectiveProfile === 'fidelity' ? DEFAULT_FIDELITY_YOUTUBE_STREAM_CLIENT : DEFAULT_COMPATIBILITY_YOUTUBE_STREAM_CLIENT);
  const highWaterMark =
    youtubeConfig?.highWaterMark ?? (effectiveProfile === 'fidelity' ? DEFAULT_FIDELITY_HIGH_WATER_MARK : null);
  const useYoutubeDL = effectiveProfile === 'compatibility';
  const disablePlayer = effectiveProfile === 'compatibility';
  const generateWithPoToken = effectiveProfile === 'fidelity' && streamClient === 'WEB' && cookieConfigured;

  return {
    requestedProfile,
    effectiveProfile,
    downgradeReason,
    streamClient,
    cookie,
    cookieConfigured,
    highWaterMark,
    overrideBridgeMode: effectiveProfile === 'fidelity' ? 'ytmusic' : null,
    useYoutubeDL,
    disablePlayer,
    generateWithPoToken,
    pipeline: useYoutubeDL ? 'youtube-dl' : 'youtubei',
  };
}

function resolveRuntimeYouTubePlaybackProfile(
  youtubeConfig?: YouTubeConfig,
  compatibilityFallbackReason?: string | null,
): ResolvedYouTubePlaybackProfile {
  const resolved = resolveYouTubePlaybackProfile(youtubeConfig);
  if (!compatibilityFallbackReason || resolved.effectiveProfile !== 'fidelity') {
    return resolved;
  }

  const compatibility = resolveYouTubePlaybackProfile({
    ...youtubeConfig,
    profile: 'compatibility',
    streamClient: undefined,
    highWaterMark: undefined,
  });

  return {
    ...compatibility,
    requestedProfile: resolved.requestedProfile,
    effectiveProfile: 'compatibility',
    downgradeReason: compatibilityFallbackReason,
  };
}

export function resolveConfiguredYouTubePipeline(youtubeConfig?: YouTubeConfig): PlaybackPipeline {
  return resolveYouTubePlaybackProfile(youtubeConfig).pipeline;
}

export function describeConfiguredPlaybackRoutes(spotifyEnabled: boolean, youtubeConfig?: YouTubeConfig): ConfiguredPlaybackRoutes {
  const youtube = resolveYouTubePlaybackProfile(youtubeConfig);

  return {
    youtube: {
      provider: 'youtube',
      pipeline: youtube.pipeline,
      routeKind: 'native',
      requestedProfile: youtube.requestedProfile,
      effectiveProfile: youtube.effectiveProfile,
      downgradeReason: youtube.downgradeReason,
      client: youtube.streamClient,
      highWaterMark: youtube.highWaterMark,
      cookieConfigured: youtube.cookieConfigured,
      overrideBridgeMode: youtube.overrideBridgeMode,
      useYoutubeDL: youtube.useYoutubeDL,
      disablePlayer: youtube.disablePlayer,
      generateWithPoToken: youtube.generateWithPoToken,
    },
    spotify: {
      provider: spotifyEnabled ? 'spotify' : 'unknown',
      pipeline: spotifyEnabled ? 'spotify-bridge' : 'unknown',
      routeKind: spotifyEnabled ? 'bridge' : 'unknown',
      enabled: spotifyEnabled,
    },
  };
}

export function normalizePlayableQuery(query: TrackLike): TrackLike {
  if (typeof query !== 'string') {
    return query;
  }

  const trimmed = stripWrappingQuotes(query.trim());
  if (!trimmed) {
    return trimmed;
  }

  return normalizeSpotifyUrl(normalizeYouTubeUrl(trimmed));
}

export function normalizeYouTubeUrl(query: string) {
  let url: URL;

  try {
    url = new URL(query);
  } catch {
    return query;
  }

  const hostname = url.hostname.replace(/^www\./u, '').toLowerCase();
  const timecode = url.searchParams.get('t') ?? url.searchParams.get('start');

  if (hostname === 'youtu.be') {
    const videoId = url.pathname.split('/').filter(Boolean)[0];
    return videoId ? buildCanonicalYouTubeWatchUrl(videoId, timecode) : query;
  }

  if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(hostname)) {
    return query;
  }

  if (url.pathname === '/watch') {
    const videoId = url.searchParams.get('v');
    if (!videoId) {
      return query;
    }

    return buildCanonicalYouTubeWatchUrl(videoId, timecode);
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts[0] && ['shorts', 'live', 'embed'].includes(pathParts[0]) && pathParts[1]) {
    return buildCanonicalYouTubeWatchUrl(pathParts[1], timecode);
  }

  return query;
}

function buildCanonicalYouTubeWatchUrl(videoId: string, timecode?: string | null) {
  const url = new URL('https://www.youtube.com/watch');
  url.searchParams.set('v', videoId);

  if (timecode) {
    url.searchParams.set('t', timecode);
  }

  return url.toString();
}

export function normalizeSpotifyUrl(query: string) {
  let url: URL;

  try {
    url = new URL(query);
  } catch {
    return query;
  }

  const hostname = url.hostname.replace(/^www\./u, '').toLowerCase();
  if (hostname !== 'open.spotify.com') {
    return query;
  }

  const pathParts = url.pathname.split('/').filter(Boolean);
  if (pathParts.length === 0) {
    return query;
  }

  const canonicalParts =
    pathParts.length >= 3 && pathParts[0].startsWith('intl-') ? pathParts.slice(1, 3) : pathParts.slice(0, 2);

  if (canonicalParts.length < 2) {
    return query;
  }

  return `https://open.spotify.com/${canonicalParts[0]}/${canonicalParts[1]}`;
}

function normalizePlaybackError(error: unknown, failureRouteContext?: PlaybackFailureRouteContext): Error {
  if (isVoiceConnectionAbortError(error)) {
    return new VoiceConnectionTimeoutError();
  }

  if (isTrackUnavailableError(error)) {
    return new PlaybackUnavailableError(
      'A faixa foi encontrada, mas o PHONIX nao conseguiu abrir um stream tocavel agora. Tente outra busca, outra URL ou repita em instantes.',
      resolvePlaybackFailureProvider(error, failureRouteContext),
      resolvePlaybackFailurePipeline(error, failureRouteContext),
    );
  }

  return error instanceof Error ? error : new PlaybackUnavailableError();
}

function inferPlaybackRouteFromTrackLike(query: TrackLike, youtubeConfig?: YouTubeConfig): PlaybackFailureRouteContext | undefined {
  if (typeof query === 'string') {
    const normalizedQuery = normalizePlayableQuery(query);
    if (typeof normalizedQuery !== 'string' || !normalizedQuery) {
      return undefined;
    }

    const route = inferSearchRoute(normalizedQuery, 'auto', youtubeConfig);
    return {
      provider: route.provider,
      pipeline: route.pipeline,
    };
  }

  if (Array.isArray(query)) {
    return inferPlaybackRouteFromTrack(query[0], youtubeConfig);
  }

  if (hasTrackCollection(query)) {
    return inferPlaybackRouteFromTrack(query.tracks[0], youtubeConfig);
  }

  if (!looksLikePlayableTrack(query)) {
    return undefined;
  }

  return inferPlaybackRouteFromTrack(query, youtubeConfig);
}

function inferPlaybackRouteFromTrack(track?: Partial<Track> | null, youtubeConfig?: YouTubeConfig): PlaybackFailureRouteContext | undefined {
  if (!track) {
    return undefined;
  }

  const route = inferTrackPlaybackRoute(track, youtubeConfig);
  return {
    provider: route.provider,
    pipeline: route.pipeline,
  };
}

function hasTrackCollection(value: unknown): value is { tracks: Track[] } {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { tracks?: unknown }).tracks);
}

function looksLikePlayableTrack(value: unknown): value is Partial<Track> {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    ('url' in (value as object) ||
      'raw' in (value as object) ||
      'extractor' in (value as object) ||
      'title' in (value as object))
  );
}

function stripWrappingQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('`') && value.endsWith('`'))
  ) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function isVoiceConnectionAbortError(error: unknown) {
  return (
    error instanceof Error &&
    ((error.name === 'AbortError' && (error as { code?: string }).code === 'ABORT_ERR') ||
      /operation was aborted/iu.test(error.message) ||
      /voice connection status ready/iu.test(error.message))
  );
}

function isTrackUnavailableError(error: unknown) {
  return (
    error instanceof Error &&
    ((error as { code?: string }).code === 'ERR_NO_RESULT' ||
      /could not extract stream for this track/iu.test(error.message) ||
      /no results found for/iu.test(error.message))
  );
}

function shouldResetQueue(queue: GuildQueue<QueueMetadata>) {
  return (
    (Boolean(queue.channel) && !hasHealthyVoiceConnection(queue) && !queue.isPlaying()) ||
    (Boolean(queue.channel) && !hasQueuedTracks(queue) && !queue.isPlaying())
  );
}

function cleanupFailedPlaybackQueue(queue: GuildQueue<QueueMetadata>) {
  if (!hasQueuedTracks(queue) && !queue.isPlaying()) {
    tryDeleteGuildQueue(queue);
  }
}

function formatRuntimeProbeError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return String(error);
}

function hasQueuedTracks(queue: Pick<GuildQueue<QueueMetadata>, 'currentTrack' | 'size'>) {
  return Boolean(queue.currentTrack) || queue.size > 0;
}

function hasHealthyVoiceConnection(queue: GuildQueue<QueueMetadata>) {
  const status = queue.dispatcher?.voiceConnection?.state.status;

  if (!status) {
    return false;
  }

  return (
    status === VoiceConnectionStatus.Ready ||
    status === VoiceConnectionStatus.Connecting ||
    status === VoiceConnectionStatus.Signalling
  );
}

function normalizeRepeatMode(repeatMode: number, autoplayEnabled: boolean) {
  if (repeatMode === QueueRepeatMode.TRACK || repeatMode === QueueRepeatMode.QUEUE || repeatMode === QueueRepeatMode.AUTOPLAY) {
    return repeatMode;
  }

  return autoplayEnabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF;
}

function countAddedTracks(searchResult: SearchResult) {
  return searchResult.hasPlaylist() ? searchResult.tracks.length : 1;
}

function selectTracksForQueueInsertion(searchResult: SearchResult) {
  return searchResult.hasPlaylist() ? searchResult.tracks : [searchResult.tracks[0]].filter(Boolean) as Track[];
}

function trimTracksForPlayback(
  tracks: Track[],
  input: {
    queue: GuildQueue<QueueMetadata> | null | undefined;
    mode: PlaybackMode;
    hasCurrentTrack: boolean;
  },
) {
  const requestedTracks = tracks.filter(Boolean);
  if (requestedTracks.length === 0) {
    throw new PlaybackSearchNoResultsError();
  }

  const maxAccepted =
    input.mode === 'replace' || !input.hasCurrentTrack
      ? Math.min(requestedTracks.length, MAX_QUEUE_SIZE + 1)
      : Math.min(requestedTracks.length, Math.max(MAX_QUEUE_SIZE - (input.queue?.size ?? 0), 0));

  if (maxAccepted <= 0) {
    throw new QueueCapacityReachedError();
  }

  return requestedTracks.slice(0, maxAccepted);
}

function toPlaybackPayload(tracks: Track[]) {
  return tracks.length === 1 ? tracks[0] : tracks;
}

function findTrackQueuePosition(queue: GuildQueue<QueueMetadata>, track: Track) {
  const trackIndex = queue.tracks.toArray().findIndex((queuedTrack) => queuedTrack.id === track.id);
  return trackIndex >= 0 ? trackIndex + 1 : null;
}

function calculateEstimatedWaitMs(queue: GuildQueue<QueueMetadata>, track: Track) {
  const trackIndex = findTrackQueuePosition(queue, track);
  if (trackIndex === null) {
    return null;
  }

  const upcomingTracks = queue.tracks.toArray();
  let totalMs = 0;

  if (queue.currentTrack) {
    const currentProgress = queue.node.getTimestamp()?.current.value ?? 0;
    totalMs += Math.max(queue.currentTrack.durationMS - currentProgress, 0);
  }

  for (let index = 0; index < trackIndex - 1; index += 1) {
    totalMs += upcomingTracks[index]?.durationMS ?? 0;
  }

  return totalMs > 0 ? totalMs : null;
}

function formatWaitDuration(durationMs: number | null) {
  if (!durationMs) {
    return null;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolvePlaybackSourceLabel(query: string, forcedSource: PlaybackSource): PlaybackSourceLabel {
  if (isSpotifyUrl(query)) {
    return 'Spotify';
  }

  if (isYouTubeUrl(query)) {
    return 'YouTube';
  }

  if (forcedSource === 'spotify') {
    return 'Spotify';
  }

  if (forcedSource === 'youtube') {
    return 'YouTube';
  }

  return 'Auto';
}

export function inferTrackPlaybackRoute(track?: Partial<Track> | null, youtubeConfig?: YouTubeConfig): PlaybackRouteDescriptor {
  const url = track?.url?.toLowerCase() ?? '';
  const source = String(track?.raw?.source ?? track?.raw?.engine ?? track?.extractor?.identifier ?? '').toLowerCase();

  if (url.includes('spotify.com') || source.includes('spotify')) {
    return {
      provider: 'spotify',
      pipeline: 'spotify-bridge',
      routeKind: 'bridge',
    };
  }

  if (url.includes('soundcloud.com') || source.includes('soundcloud')) {
    return {
      provider: 'soundcloud',
      pipeline: 'soundcloud-extractor',
      routeKind: 'bridge',
    };
  }

  if (url.includes('youtu') || source.includes('youtube')) {
    return {
      provider: 'youtube',
      pipeline: inferYouTubePipelineFromTrackSource(source, youtubeConfig),
      routeKind: 'native',
    };
  }

  return {
    provider: 'unknown',
    pipeline: 'unknown',
    routeKind: 'unknown',
  };
}

function inferSearchRoute(query: string, forcedSource: PlaybackSource, youtubeConfig?: YouTubeConfig): PlaybackRouteDescriptor {
  if (isSpotifyUrl(query) || forcedSource === 'spotify') {
    return {
      provider: 'spotify',
      pipeline: 'spotify-bridge',
      routeKind: 'bridge',
    };
  }

  return {
    provider: 'youtube',
    pipeline: resolveConfiguredYouTubePipeline(youtubeConfig),
    routeKind: 'native',
  };
}

function inferErrorProvider(error: unknown): PlaybackProvider {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('soundcloudextractor') || message.includes('soundcloud')) {
    return 'soundcloud';
  }

  if (message.includes('spotify')) {
    return 'spotify';
  }

  if (message.includes('youtube') || message.includes('youtu') || message.includes('youtubei')) {
    return 'youtube';
  }

  return 'unknown';
}

function inferErrorPipeline(error: unknown): PlaybackPipeline {
  const message = error instanceof Error ? error.message.toLowerCase() : '';

  if (message.includes('soundcloudextractor') || message.includes('soundcloud')) {
    return 'soundcloud-extractor';
  }

  if (message.includes('youtube-dl') || message.includes('youtube-dl-exec')) {
    return 'youtube-dl';
  }

  if (message.includes('youtubei') || message.includes('youtubejs') || message.includes('youtube')) {
    return 'youtubei';
  }

  if (message.includes('spotify')) {
    return 'spotify-bridge';
  }

  if (message.includes('ffmpeg')) {
    return 'ffmpeg';
  }

  if (message.includes('voice')) {
    return 'voice';
  }

  return 'unknown';
}

function inferYouTubePipelineFromTrackSource(source: string, youtubeConfig?: YouTubeConfig): PlaybackPipeline {
  if (source.includes('youtube-dl') || source.includes('ytdl')) {
    return 'youtube-dl';
  }

  if (source.includes('youtubei') || source.includes('youtubejs')) {
    return 'youtubei';
  }

  return resolveConfiguredYouTubePipeline(youtubeConfig);
}

function resolvePlaybackFailureProvider(error: unknown, failureRouteContext?: PlaybackFailureRouteContext): PlaybackProvider {
  const inferredProvider = inferErrorProvider(error);
  if (inferredProvider !== 'unknown') {
    return inferredProvider;
  }

  return failureRouteContext?.provider ?? 'unknown';
}

function resolvePlaybackFailurePipeline(error: unknown, failureRouteContext?: PlaybackFailureRouteContext): PlaybackPipeline {
  const inferredPipeline = inferErrorPipeline(error);
  if (inferredPipeline !== 'unknown') {
    return inferredPipeline;
  }

  return failureRouteContext?.pipeline ?? 'unknown';
}

function buildPlaybackHint(input: {
  mode: PlaybackMode;
  startedPlayback: boolean;
  resultType: 'track' | 'playlist';
  truncatedCount: number;
}) {
  if (input.truncatedCount > 0) {
    return 'Use /queue para revisar a ordem e /clear se quiser abrir espaco antes de adicionar mais.';
  }

  if (input.mode === 'replace') {
    return 'Use /queue para conferir a nova fila ou /skip para avancar mais rapido.';
  }

  if (input.startedPlayback) {
    return input.resultType === 'playlist'
      ? 'Use /queue para acompanhar as proximas faixas da playlist.'
      : 'Use /queue para ver o que vem depois ou /favorite add para salvar esta faixa.';
  }

  if (input.mode === 'next') {
    return 'Use /skip se quiser ir direto para a proxima faixa agora.';
  }

  return input.resultType === 'playlist'
    ? 'Use /queue para revisar a playlist adicionada e /shuffle para embaralhar.'
    : 'Use /queue para revisar a fila ou /favorite add para salvar esta faixa.';
}
