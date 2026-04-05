import type { GuildQueue, Player, Track } from 'discord-player';
import type { GuildMember, User } from 'discord.js';
import { PreconditionCommandError, ValidationCommandError } from '../../commands/errors.js';
import { ensureAudioPlaybackAvailable } from '../../commands/audioPlayback.js';
import type { FavoritesService } from '../services/favoritesService.js';
import type { HistoryService } from '../services/historyService.js';
import type { PlaylistsService } from '../services/playlistsService.js';
import type { FfmpegStatus } from '../../music/ffmpeg.js';
import { MusicService, normalizePlayableQuery, type QueueMetadata } from '../../music/musicService.js';
import { serializeTrack } from '../../music/trackCodec.js';
import { favoriteRecordToStoredTrack, playlistItemRecordToStoredTrack } from '../trackMapping.js';
import type { LibraryMutationResult } from './contracts.js';
import type {
  CollectionEntryView,
  CollectionView,
  NoticeFieldView,
  NoticeView,
} from '../../ui/view-models.js';
import { formatSourceLabel, toTrackCardView } from '../../ui/trackCards.js';

interface LibraryUseCaseDeps {
  player: Player;
  ffmpeg: FfmpegStatus;
  music: MusicService;
  favorites: FavoritesService;
  playlists: PlaylistsService;
  history: HistoryService;
}

interface LibraryBaseInput {
  guildId: string;
  user: User;
  member: GuildMember;
  metadata: QueueMetadata;
  queue?: GuildQueue<QueueMetadata>;
}

interface FavoriteAddInput extends LibraryBaseInput {
  query?: string;
}

interface FavoriteIndexInput extends LibraryBaseInput {
  index: number;
}

interface PlaylistNamedInput extends LibraryBaseInput {
  name: string;
}

interface PlaylistAddInput extends PlaylistNamedInput {
  query?: string;
}

interface PlaylistRemoveInput extends PlaylistNamedInput {
  index: number;
}

interface PlaylistListInput extends LibraryBaseInput {
  name?: string;
}

export function createLibraryUseCases(deps: LibraryUseCaseDeps) {
  return {
    async favoriteAdd(input: FavoriteAddInput): Promise<LibraryMutationResult> {
      const track = await resolveTrackForLibraryInput(deps, input, input.query);
      await deps.favorites.add(input.user.id, serializeTrack(track));

      return trackResult(
        'PHONIX | Favorito salvo',
        track,
        'A faixa entrou nos seus favoritos pessoais e ficou pronta para tocar de novo sem precisar pesquisar tudo outra vez.',
        {
          fields: [
            {
              name: 'Origem do atalho',
              value: input.query ? 'Busca ou URL informada manualmente por voce.' : 'Faixa atual reaproveitada da sessao ativa.',
              inline: true,
            },
            {
              name: 'Como reutilizar',
              value: 'Use `/favorite list` para ver os indices ou `/favorite play index:1` para puxar um favorito salvo de volta para a sessao.',
              inline: false,
            },
          ],
          hint: 'Se quiser guardar essa musica dentro de uma selecao maior, use `/playlist add name:"nome-da-playlist"` depois deste atalho.',
        },
      );
    },

    async favoriteRemove(input: FavoriteIndexInput): Promise<LibraryMutationResult> {
      const removed = await deps.favorites.removeByIndex(input.user.id, input.index);
      if (!removed) {
        throw new ValidationCommandError('Nao existe favorito nessa posicao. Use `/favorite list` ou `!favorite list` para conferir os indices atuais.', {
          title: 'Favorito nao encontrado',
        });
      }

      return notice('success', 'PHONIX | Favorito removido', `**${removed.title}** saiu da sua biblioteca pessoal.`, {
        fields: [
          {
            name: 'Atalho removido',
            value: [`Indice: **#${input.index}**`, `Faixa: **${removed.title}**`].join('\n'),
            inline: true,
          },
          {
            name: 'Como seguir',
            value: 'Use `/favorite list` para revisar os indices atuais ou `/favorite add` para guardar outra faixa.',
            inline: true,
          },
        ],
        hint: 'Se voce removeu um item por engano, basta salvar a faixa de novo com `/favorite add` usando a musica atual ou uma nova busca.',
      });
    },

    async favoriteList(userId: string): Promise<LibraryMutationResult> {
      const favorites = await deps.favorites.list(userId);
      const visibleFavorites = favorites.slice(0, 10);
      return collectionView({
        title: 'PHONIX | Seus favoritos',
        description:
          favorites.length > 0
            ? `Voce tem **${favorites.length}** favorito(s) salvo(s) prontos para tocar de novo com indice rapido.`
            : 'Voce ainda nao salvou favoritos. Use `/favorite add` com a faixa atual ou informe uma busca/URL para montar sua biblioteca.',
        collectionTitle: 'Favoritos salvos',
        leadTrack: visibleFavorites[0]
          ? toTrackCardView(visibleFavorites[0], {
              sourceLabel: formatSourceLabel(visibleFavorites[0].source),
            })
          : null,
        entries: visibleFavorites.map((item, index) =>
          collectionEntry({
            position: index + 1,
            title: item.title,
            subtitle: item.author || 'Desconhecido',
            duration: item.duration,
            source: item.source,
            url: item.url,
          }),
        ),
        hiddenEntryCount: favorites.length - visibleFavorites.length,
        summaryTitle: 'Biblioteca pessoal',
        summaryLines: [
          `Favoritos salvos: **${favorites.length}**`,
          `Recorte visivel: **${visibleFavorites.length}**`,
          'Atalho rapido: **play/remove por indice**',
        ],
        actionTitle: 'Fluxo rapido',
        actionLines: [
          'Toque um indice com `/favorite play index:x`.',
          'Remova um indice com `/favorite remove index:x`.',
          'Use `/favorite add` sem query para reaproveitar a faixa atual.',
        ],
        hint:
          favorites.length > 0
            ? 'Use `/favorite play index:1` ou `!favorite play 1` para tocar um favorito salvo.'
            : 'Comece com `/favorite add` usando a musica atual ou uma busca direta.',
      });
    },

    async favoritePlay(input: FavoriteIndexInput): Promise<LibraryMutationResult> {
      ensureAudioPlaybackAvailable(deps.ffmpeg);
      const favorite = await deps.favorites.getByIndex(input.user.id, input.index);
      if (!favorite) {
        throw new ValidationCommandError('Nao existe favorito nessa posicao. Use `/favorite list` ou `!favorite list` para conferir os indices atuais.', {
          title: 'Favorito nao encontrado',
        });
      }

      const voiceChannel = await deps.music.ensurePlayableVoiceChannel(input.member);
      const result = await deps.music.playStoredTracks(
        voiceChannel,
        [favoriteRecordToStoredTrack(favorite)],
        input.user,
        input.metadata,
      );
      const startedPlayback = result.queue.currentTrack?.url === result.track.url;

      return trackResult(
        startedPlayback ? 'PHONIX | Favorito tocando agora' : 'PHONIX | Favorito enviado para a fila',
        result.track,
        startedPlayback
          ? 'O favorito comecou a tocar agora no seu canal e reaproveitou a sessao atual do PHONIX.'
          : 'O favorito entrou na fila atual do PHONIX para tocar logo depois do que ja esta em andamento.',
        {
          fields: [
            {
              name: 'Biblioteca pessoal',
              value: `Favorito **#${input.index}** recuperado da sua lista pessoal.`,
              inline: true,
            },
            {
              name: 'Entrada na sessao',
              value: startedPlayback
                ? 'Entrou no ar agora e assumiu a sessao atual.'
                : 'Entrou na fila sem interromper a faixa que ja estava tocando.',
              inline: true,
            },
          ],
          hint: startedPlayback
            ? 'Use `/nowplaying` para revisar a sessao atual ou `/favorite list` para puxar outro favorito depois.'
            : 'Use `/queue` para confirmar a ordem da fila ou `/skip` se quiser adiantar a troca.',
        },
      );
    },

    async playlistCreate(input: PlaylistNamedInput): Promise<NoticeView> {
      const playlist = await deps.playlists.create(input.user.id, input.name);
      return notice('success', 'PHONIX | Playlist criada', `A playlist **${playlist.name}** foi criada e esta pronta para receber faixas.`, {
        fields: [
          {
            name: 'Nome salvo',
            value: `Playlist criada como **${playlist.name}** na sua biblioteca pessoal.`,
            inline: true,
          },
          {
            name: 'Primeiro proximo passo',
            value: `Use \`/playlist add name:"${playlist.name}"\` para guardar a musica atual ou uma busca/URL nova.`,
            inline: true,
          },
        ],
        hint: 'Depois de adicionar algumas faixas, use `/playlist list name:"' + playlist.name + '"` para revisar a ordem e `/playlist play` para puxar a selecao inteira.',
      });
    },

    async playlistAdd(input: PlaylistAddInput): Promise<LibraryMutationResult> {
      const track = await resolveTrackForLibraryInput(deps, input, input.query);
      const item = await deps.playlists.addTrack(input.user.id, input.name, serializeTrack(track));
      if (!item) {
        throw new ValidationCommandError('Playlist nao encontrada. Use `/playlist list` para conferir os nomes salvos.', {
          title: 'Playlist nao encontrada',
        });
      }

      return trackResult(
        'PHONIX | Faixa salva na playlist',
        track,
        `A faixa entrou na playlist **${input.name.trim()}** e ficou pronta para tocar depois com o restante da sua selecao.`,
        {
          fields: [
            {
              name: 'Playlist alvo',
              value: `**${input.name.trim()}**`,
              inline: true,
            },
            {
              name: 'Origem da faixa',
              value: input.query ? 'Busca ou URL informada manualmente por voce.' : 'Faixa atual reaproveitada da sessao ativa.',
              inline: true,
            },
          ],
          hint: `Use \`/playlist list name:"${input.name.trim()}"\` para revisar o conteudo salvo ou \`/playlist play name:"${input.name.trim()}"\` para tocar essa lista depois.`,
        },
      );
    },

    async playlistRemove(input: PlaylistRemoveInput): Promise<NoticeView> {
      const removed = await deps.playlists.removeTrack(input.user.id, input.name, input.index);
      if (!removed) {
        throw new ValidationCommandError('Playlist ou faixa nao encontrada. Use `/playlist list` para conferir o nome e os indices salvos.', {
          title: 'Item de playlist nao encontrado',
        });
      }

      return notice('success', 'PHONIX | Faixa removida', `**${removed.title}** saiu da playlist **${input.name.trim()}**.`, {
        fields: [
          {
            name: 'Playlist afetada',
            value: `**${input.name.trim()}**`,
            inline: true,
          },
          {
            name: 'Indice removido',
            value: `Posicao solicitada: **${input.index}**`,
            inline: true,
          },
        ],
        hint: 'Use `/playlist list name:"' + input.name.trim() + '"` para revisar as posicoes atuais e decidir a proxima faixa a entrar.',
      });
    },

    async playlistList(input: PlaylistListInput): Promise<LibraryMutationResult> {
      if (!input.name) {
        const playlists = await deps.playlists.list(input.user.id);
        const visiblePlaylists = playlists.slice(0, 12);
        return collectionView({
          title: 'PHONIX | Suas playlists',
          description:
            playlists.length > 0
              ? `Voce tem **${playlists.length}** playlist(s) pessoal(is) salva(s) no PHONIX.`
              : 'Voce ainda nao criou playlists. Use `/playlist create` para montar sua primeira lista.',
          collectionTitle: 'Playlists salvas',
          leadTrack: null,
          entries: visiblePlaylists.map((playlist, index) => ({
            position: index + 1,
            title: playlist.name,
            subtitle: `Atualizada em ${formatShortDate(playlist.updatedAt)}`,
            duration: null,
            sourceLabel: null,
            url: null,
          })),
          hiddenEntryCount: playlists.length - visiblePlaylists.length,
          summaryTitle: 'Biblioteca pessoal',
          summaryLines: [
            `Playlists salvas: **${playlists.length}**`,
            `Recorte visivel: **${visiblePlaylists.length}**`,
            'Ordenacao: **mais recentes primeiro**',
          ],
          actionTitle: 'Fluxo rapido',
          actionLines: [
            'Abra uma playlist com `/playlist list name:"nome"`.',
            'Toque uma playlist com `/playlist play name:"nome"`.',
            'Crie outra com `/playlist create name:"nova-playlist"`.',
          ],
          hint:
            playlists.length > 0
              ? 'Use `/playlist list name:"nome"` para ver o conteudo ou `/playlist play name:"nome"` para tocar uma delas.'
              : 'Comece com `/playlist create name:"mix da madrugada"`.',
        });
      }

      const items = await deps.playlists.listItems(input.user.id, input.name);
      if (!items) {
        throw new ValidationCommandError('Playlist nao encontrada. Use `/playlist list` para conferir os nomes salvos.', {
          title: 'Playlist nao encontrada',
        });
      }

      const visibleItems = items.slice(0, 10);
      return collectionView({
        title: `PHONIX | Playlist ${input.name.trim()}`,
        description:
          items.length > 0
            ? `A playlist **${input.name.trim()}** tem **${items.length}** faixa(s) salva(s) e esta pronta para tocar.`
            : 'Essa playlist ainda esta vazia. Use `/playlist add` com a faixa atual ou informe uma busca/URL.',
        collectionTitle: 'Faixas salvas',
        leadTrack: visibleItems[0]
          ? toTrackCardView(visibleItems[0], {
              sourceLabel: formatSourceLabel(visibleItems[0].source),
            })
          : null,
        entries: visibleItems.map((item) =>
          collectionEntry({
            position: item.position,
            title: item.title,
            subtitle: item.author || 'Desconhecido',
            duration: item.duration,
            source: item.source,
            url: item.url,
          }),
        ),
        hiddenEntryCount: items.length - visibleItems.length,
        summaryTitle: 'Leitura da playlist',
        summaryLines: [
          `Playlist alvo: **${input.name.trim()}**`,
          `Faixas salvas: **${items.length}**`,
          `Recorte visivel: **${visibleItems.length}**`,
        ],
        actionTitle: 'Como agir nesta playlist',
        actionLines: [
          `Toque tudo com \`/playlist play name:"${input.name.trim()}"\`.`,
          `Remova um item com \`/playlist remove name:"${input.name.trim()}" index:x\`.`,
        ],
        hint:
          items.length > 0
            ? 'Use `/playlist play name:"' + input.name.trim() + '"` para iniciar essa playlist.'
            : 'Use `/playlist add name:"' + input.name.trim() + '"` para guardar a faixa atual ou uma nova busca.',
      });
    },

    async playlistPlay(input: PlaylistNamedInput): Promise<LibraryMutationResult> {
      ensureAudioPlaybackAvailable(deps.ffmpeg);
      const items = await deps.playlists.listItems(input.user.id, input.name);
      if (!items || items.length === 0) {
        throw new ValidationCommandError('Playlist nao encontrada ou vazia. Use `/playlist list` para confirmar o nome e o conteudo salvo.', {
          title: 'Playlist indisponivel',
        });
      }

      const voiceChannel = await deps.music.ensurePlayableVoiceChannel(input.member);
      const result = await deps.music.playStoredTracks(
        voiceChannel,
        items.map(playlistItemRecordToStoredTrack),
        input.user,
        input.metadata,
      );
      const startedPlayback = result.queue.currentTrack?.url === result.track.url;

      return trackResult(
        startedPlayback ? 'PHONIX | Playlist iniciada' : 'PHONIX | Playlist enviada para a fila',
        result.track,
        startedPlayback
          ? `A playlist **${input.name.trim()}** comecou a tocar agora e a primeira faixa ja entrou no ar no seu canal.`
          : `A playlist **${input.name.trim()}** entrou na fila atual do PHONIX para continuar a sessao sem interromper o que ja estava tocando.`,
        {
          fields: [
            {
              name: 'Playlist chamada',
              value: `**${input.name.trim()}** com **${items.length}** faixa(s) salva(s).`,
              inline: true,
            },
            {
              name: 'Entrada na sessao',
              value: startedPlayback
                ? 'A primeira faixa assumiu a sessao atual agora.'
                : 'A playlist entrou na fila atual para tocar em seguida.',
              inline: true,
            },
          ],
          hint: startedPlayback
            ? 'Use `/queue` para revisar a ordem completa da playlist ou `/shuffle` se quiser embaralhar as proximas faixas.'
            : 'Use `/queue` para revisar onde a playlist entrou ou `/skip` se quiser ir direto para ela.',
        },
      );
    },

    async playlistDelete(input: PlaylistNamedInput): Promise<NoticeView> {
      const removed = await deps.playlists.delete(input.user.id, input.name);
      if (!removed) {
        throw new ValidationCommandError('Playlist nao encontrada. Use `/playlist list` para conferir os nomes salvos.', {
          title: 'Playlist nao encontrada',
        });
      }

      return notice('success', 'PHONIX | Playlist removida', `A playlist **${input.name.trim()}** foi apagada da sua biblioteca.`, {
        fields: [
          {
            name: 'Biblioteca pessoal',
            value: `A playlist **${input.name.trim()}** nao faz mais parte da sua lista salva.`,
            inline: false,
          },
        ],
        hint: 'Use `/playlist list` para revisar o que restou ou `/playlist create` para montar outra selecao do zero.',
      });
    },

    async history(userId: string): Promise<LibraryMutationResult> {
      const items = await deps.history.list(userId);
      const visibleItems = items.slice(0, 10);
      return collectionView({
        title: 'PHONIX | Historico recente',
        description:
          items.length > 0
            ? `Estas sao as ultimas **${items.length}** faixa(s) registradas no seu uso recente do PHONIX.`
            : 'Seu historico ainda esta vazio. Toque algo com `/play` e o PHONIX passa a registrar as ultimas faixas para voce.',
        collectionTitle: 'Ultimas reproducoes',
        leadTrack: visibleItems[0]
          ? toTrackCardView(visibleItems[0], {
              sourceLabel: formatSourceLabel(visibleItems[0].source),
            })
          : null,
        entries: visibleItems.map((item, index) =>
          collectionEntry({
            position: index + 1,
            title: item.title,
            subtitle: item.author || 'Desconhecido',
            duration: item.duration,
            source: item.source,
            url: item.url,
          }),
        ),
        hiddenEntryCount: items.length - visibleItems.length,
        summaryTitle: 'Memoria recente',
        summaryLines: [
          `Faixas registradas: **${items.length}**`,
          `Recorte visivel: **${visibleItems.length}**`,
          'Reuso direto por indice: **nao implementado ainda**',
        ],
        actionTitle: 'Como reaproveitar',
        actionLines: [
          'Repita a busca manualmente com `/play nome-da-faixa`.',
          'Guarde o que gostar com `/favorite add query:nome-da-faixa`.',
          'Monte uma selecao com `/playlist add name:"nome" query:nome-da-faixa`.',
        ],
        hint:
          items.length > 0
            ? 'O historico e uma memoria rapida de busca. Hoje ele nao toca por indice, entao use o titulo como base para `/play`, `/favorite add query:...` ou `/playlist add`.'
            : 'Comece com `/play` ou `!tocar` para o PHONIX registrar seu uso.',
      });
    },
  };
}

async function resolveTrackForLibraryInput(deps: LibraryUseCaseDeps, input: FavoriteAddInput | PlaylistAddInput, query?: string) {
  if (!query) {
    const queue = input.queue;
    if (!queue || !queue.currentTrack) {
      throw new PreconditionCommandError(
        'Nada tocando agora. Informe uma busca ou URL para salvar, ou toque uma faixa antes de usar a biblioteca como atalho.',
      );
    }

    if (queue.channel) {
      deps.music.ensureSameVoiceChannel(input.member);
    }

    return queue.currentTrack;
  }

  const normalizedQuery = normalizePlayableQuery(query);
  const result = await deps.player.search(normalizedQuery, {
    requestedBy: input.user.id,
    searchEngine: deps.music.resolveSearchEngine(typeof normalizedQuery === 'string' ? normalizedQuery : query),
  });

  if (result.isEmpty() || result.tracks.length === 0) {
    throw new ValidationCommandError('Nenhum resultado encontrado para essa busca. Tente outro termo ou envie uma URL direta.', {
      title: 'Nada encontrado',
    });
  }

  return result.tracks[0] as Track;
}

function notice(
  variant: 'success' | 'info' | 'warning',
  title: string,
  description: string,
  options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
): NoticeView {
  return {
    kind: 'notice',
    variant,
    title,
    description,
    fields: options.fields,
    hint: options.hint ?? null,
  };
}

function trackResult(
  title: string,
  track: Track,
  description: string,
  options: { fields?: NoticeFieldView[]; hint?: string | null } = {},
): LibraryMutationResult {
  return {
    kind: 'track',
    title,
    description,
    track: toTrackCardView(track),
    fields: options.fields,
    hint: options.hint ?? null,
  };
}

function collectionView(input: Omit<CollectionView, 'kind'>): CollectionView {
  return {
    kind: 'collection',
    ...input,
  };
}

function collectionEntry(input: {
  position: number | null;
  title: string;
  subtitle: string | null;
  duration: string | null;
  source: string | null | undefined;
  url: string | null | undefined;
}): CollectionEntryView {
  return {
    position: input.position,
    title: input.title,
    subtitle: input.subtitle,
    duration: input.duration,
    sourceLabel: formatSourceLabel(input.source),
    url: typeof input.url === 'string' && input.url.length > 0 ? input.url : null,
  };
}

function formatShortDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
