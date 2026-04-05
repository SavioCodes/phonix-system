import type { AppConfig, ResolvedDashboardConfig } from '../../core/config/env.js';

export function buildDashboardVerificationChecklist(
  config: AppConfig,
  dashboard: ResolvedDashboardConfig,
) {
  const checklist = [
    'Confirme que o callback OAuth registrado no Discord corresponde exatamente a `DASHBOARD_BASE_URL + /dashboard/callback`.',
    'Acesse `/dashboard/login` e valide o fluxo completo de login com uma conta administrativa real.',
    'Confirme o caso de `Sem guilds elegiveis` usando uma conta sem permissao admin ou sem o bot instalado na guild.',
    'Valide `GET /api/dashboard/guilds` e confirme se a lista bate com as guilds em que o usuario ainda e admin.',
    'Abra `/dashboard`, troque a guild e confira `Overview`, `Diagnostics`, `Config` e `Operations`.',
    'Altere `prefix`, `defaultVolume`, `autoplayEnabled` e `resumeQueueEnabled` pelo painel e confirme reflexo no bot/doctor.',
    'Execute `recover` e `stop` pelo painel e confira telemetria/estado da sessao.',
    'Force expiracao ou revogacao de acesso e confirme que o painel exige revalidacao segura.',
  ];

  if (!dashboard.effectiveEnabled) {
    checklist.unshift(
      `Corrija a configuracao do dashboard antes da rodada manual: ${dashboard.disableReason ?? 'dashboard ainda nao esta efetivo.'}`,
    );
  }

  if (!config.dashboard?.discordClientSecret) {
    checklist.unshift('Preencha `DISCORD_CLIENT_SECRET` para habilitar o OAuth do Admin Center.');
  }

  return checklist;
}
