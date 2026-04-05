import 'dotenv/config';
import { parseConfig } from '../core/config/env.js';
import {
  buildPlaybackVerificationChecklist,
  buildPlaybackVerificationMatrix,
  formatPlaybackVerificationTable,
} from './support/playbackVerification.js';
import { describeConfiguredPlaybackRoutes } from '../modules/music/musicService.js';
import { runStandardVerificationSuite } from './support/verificationRuntime.js';

const config = parseConfig(process.env);
const currentRoutes = describeConfiguredPlaybackRoutes(config.spotify.enabled, config.youtube);
const verificationMatrix = buildPlaybackVerificationMatrix(config);
const checklist = buildPlaybackVerificationChecklist();

console.log('PHONIX | Playback Verification');
console.log('');
console.log('1. Executando validacoes automaticas locais...');

runStandardVerificationSuite();

console.log('');
console.log('2. Estado atual detectado no ambiente');
console.log(`- Spotify habilitado: ${config.spotify.enabled ? 'sim' : 'nao'}`);
console.log(`- Perfil solicitado por padrao: ${config.youtube?.profile ?? 'compatibility'}`);
console.log(`- Perfil efetivo atual: ${currentRoutes.youtube.effectiveProfile}`);
console.log(`- Pipeline atual do YouTube: ${currentRoutes.youtube.pipeline}`);
console.log(`- Client atual do YouTube: ${currentRoutes.youtube.client}`);
console.log(`- Cookie configurado: ${currentRoutes.youtube.cookieConfigured ? 'sim' : 'nao'}`);
console.log(`- Spotify route atual: ${currentRoutes.spotify.enabled ? `${currentRoutes.spotify.pipeline} (${currentRoutes.spotify.routeKind})` : 'desativado'}`);

console.log('');
console.log('3. Matriz A/B sugerida para Discord');
console.log(formatPlaybackVerificationTable(verificationMatrix));

console.log('');
console.log('4. Checklist manual para o Discord');
for (const item of checklist) {
  console.log(`- ${item}`);
}

console.log('');
console.log('5. Comandos uteis para cada rodada');
console.log(`- PowerShell compatibility: $env:YOUTUBE_PLAYBACK_PROFILE='compatibility'; npm run start`);
console.log(`- PowerShell fidelity: $env:YOUTUBE_PLAYBACK_PROFILE='fidelity'; npm run start`);
console.log('- Dentro do Discord: rode `/doctor`, confirme bitrate/perfil/pipeline, depois use `/play <mesma-faixa-ou-url>`.');
console.log('- Documente tempo ate o primeiro audio, stutters em 90s, falhas de stream e se houve recovery.');
