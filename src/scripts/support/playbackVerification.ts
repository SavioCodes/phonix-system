import type { AppConfig, YouTubePlaybackProfile } from '../../core/config/env.js';
import { describeConfiguredPlaybackRoutes } from '../../modules/music/musicService.js';

export interface PlaybackVerificationRow {
  bitrateKbps: number;
  requestedProfile: YouTubePlaybackProfile;
  effectiveProfile: YouTubePlaybackProfile;
  pipeline: string;
  routeKind: 'native' | 'bridge' | 'unknown';
  client: string;
  ready: boolean;
  blockingReason: string | null;
}

const DEFAULT_BITRATES_KBPS = [64, 128, 256, 384] as const;
const ORDERED_PROFILES: readonly YouTubePlaybackProfile[] = ['compatibility', 'fidelity'] as const;

export function buildPlaybackVerificationMatrix(
  config: AppConfig,
  bitratesKbps: readonly number[] = DEFAULT_BITRATES_KBPS,
): PlaybackVerificationRow[] {
  return ORDERED_PROFILES.flatMap((requestedProfile) => {
    const routes = describeConfiguredPlaybackRoutes(config.spotify.enabled, {
      ...config.youtube,
      profile: requestedProfile,
    });

    return bitratesKbps.map((bitrateKbps) => ({
      bitrateKbps,
      requestedProfile,
      effectiveProfile: routes.youtube.effectiveProfile,
      pipeline: routes.youtube.pipeline,
      routeKind: routes.youtube.routeKind,
      client: routes.youtube.client,
      ready: requestedProfile === 'compatibility' || routes.youtube.effectiveProfile === 'fidelity',
      blockingReason:
        requestedProfile === 'fidelity' && routes.youtube.effectiveProfile !== 'fidelity'
          ? routes.youtube.downgradeReason
          : null,
    }));
  });
}

export function buildPlaybackVerificationChecklist() {
  return [
    'Use a mesma faixa ou URL do YouTube em todas as execucoes para reduzir variacao da busca.',
    'Nao use links do Spotify para comparar fidelidade; Spotify hoje funciona por bridge.',
    'Antes de cada rodada, rode `/doctor` dentro do canal alvo para confirmar bitrate, perfil solicitado/efetivo, client e pipeline real.',
    'Meca tempo ate o primeiro audio, stutters audiveis, falhas de stream, recoveries e discrepancias entre perfil solicitado e efetivo.',
    'Se o servidor nao oferecer 256 ou 384 kbps, marque a linha como indisponivel em vez de inferir resultado.',
  ];
}

export function formatPlaybackVerificationTable(rows: readonly PlaybackVerificationRow[]) {
  const header = ['Bitrate', 'Perfil', 'Efetivo', 'Pipeline', 'Client', 'Pronto', 'Bloqueio'];
  const table = rows.map((row) => [
    `${row.bitrateKbps} kbps`,
    row.requestedProfile,
    row.effectiveProfile,
    row.pipeline,
    row.client,
    row.ready ? 'sim' : 'nao',
    row.blockingReason ?? '-',
  ]);
  const widths = header.map((label, columnIndex) =>
    Math.max(label.length, ...table.map((row) => row[columnIndex]?.length ?? 0)),
  );

  const formatRow = (row: readonly string[]) =>
    row.map((value, index) => value.padEnd(widths[index], ' ')).join(' | ');

  return [
    formatRow(header),
    widths.map((width) => '-'.repeat(width)).join('-|-'),
    ...table.map((row) => formatRow(row)),
  ].join('\n');
}
