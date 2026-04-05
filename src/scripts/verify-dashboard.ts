import 'dotenv/config';
import { parseConfig, resolveDashboardConfig } from '../core/config/env.js';
import { buildDashboardVerificationChecklist } from './support/dashboardVerification.js';
import { runStandardVerificationSuite } from './support/verificationRuntime.js';

const config = parseConfig(process.env);
const dashboard = resolveDashboardConfig(config.dashboard);
const checklist = buildDashboardVerificationChecklist(config, dashboard);

console.log('PHONIX | Dashboard Verification');
console.log('');
console.log('1. Executando validacoes automaticas locais...');

runStandardVerificationSuite();

console.log('');
console.log('2. Estado atual detectado no ambiente');
console.log(`- Versao atual: ${config.appVersion ?? 'desconhecida'}`);
console.log(`- Dashboard solicitado: ${dashboard.requestedEnabled ? 'sim' : 'nao'}`);
console.log(`- Dashboard efetivo: ${dashboard.effectiveEnabled ? 'sim' : 'nao'}`);
console.log(`- Base URL: ${dashboard.baseUrl ?? 'ausente'}`);
console.log(`- Porta: ${dashboard.port}`);
console.log(`- DISCORD_CLIENT_SECRET: ${config.dashboard?.discordClientSecret ? 'configurado' : 'ausente'}`);
console.log(`- DASHBOARD_SESSION_SECRET: ${config.dashboard?.sessionSecret ? 'configurado' : 'ausente'}`);
console.log(`- Motivo de bloqueio: ${dashboard.disableReason ?? '-'}`);

console.log('');
console.log('3. Checklist manual do Admin Center');
for (const item of checklist) {
  console.log(`- ${item}`);
}

console.log('');
console.log('4. Comandos uteis');
console.log('- Bot + dashboard: npm run start');
console.log('- Dashboard local: abra /dashboard na base URL configurada');
console.log('- Validacao de playback continua disponivel em: npm run verify:playback');
