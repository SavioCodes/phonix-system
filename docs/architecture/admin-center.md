# PHONIX Admin Center

## Visao geral

O `Admin Center` e a nova superficie web da linha `v2.x`. Ele roda no mesmo processo do bot Discord, reaproveita os mesmos services/use cases centrais e foi desenhado para administracao segura por guild, nao para substituir a operacao diaria dentro do Discord.

O painel atual cobre quatro areas:

- `Overview`
- `Config`
- `Diagnostics`
- `Operations`

Docs relacionadas:

- `README.md`
- `docs/verification/admin-center-verification.md`
- `docs/releases/project-tracker.md`
- `docs/releases/changelog.md`

## O que o painel faz

### Overview

- mostra a guild selecionada
- mostra `bot tag`, estado da fila e faixa atual
- mostra canal de voz, canal de texto, bitrate alvo e volume ao vivo
- mostra requested/effective profile do YouTube, pipeline, client, `highWaterMark`, cookie e route kind
- mostra o estado atual de recovery e sessao persistida

### Config

- edita `prefix`
- edita `defaultVolume`
- edita `autoplayEnabled`
- edita `resumeQueueEnabled`

As mutacoes usam os mesmos services que os comandos `/config` e `!config`.

### Diagnostics

- expande a leitura do `doctor`
- mostra checks operacionais, estado geral e proximos passos
- deixa explicito o estado do `Admin Center`, pipeline real e limitacoes do source

### Operations

- lista incidentes recentes da guild
- mostra a sessao persistida atual
- expoe `recover` seguro
- expoe `stop` seguro

## O que a `v2.x` ainda nao faz pela web

- tocar musica via web
- editar fila via web
- controlar biblioteca pessoal do usuario via web
- publicar dashboard publico
- separar deploy em outro processo
- `NAO IMPLEMENTADO AINDA`: `source:soundcloud` como source direto

## Autenticacao e autorizacao

O login usa `Discord OAuth2 Authorization Code Flow`.

Para a sessao ficar elegivel, o PHONIX exige:

- que o bot esteja instalado na guild
- que o usuario autenticado tenha permissao administrativa nessa guild

As sessoes sao persistidas em SQLite na tabela `DashboardSession`, com:

- `id`
- `discordUserId`
- `username`
- `avatar`
- `authorizedGuildIdsJson`
- `csrfTokenHash`
- `oauthAccessTokenCiphertext`
- `oauthRefreshTokenCiphertext`
- `oauthTokenType`
- `oauthScope`
- `oauthExpiresAt`
- `lastAuthorizedSyncAt`
- `expiresAt`
- timestamps

Seguranca atual:

- cookie HTTP-only assinado para sessao
- cookie separado para CSRF
- validacao de `x-csrf-token` em `PATCH` e `POST`
- TTL padrao de `24h`
- tokens OAuth cifrados em repouso em SQLite
- revalidacao automatica de guild filtering ao longo da sessao
- refresh obrigatorio do OAuth antes de mutacoes criticas
- invalidacao segura da sessao quando o refresh falha

Na `v2.0.2`, o painel deixou de confiar apenas no snapshot do login. Agora ele volta a consultar o OAuth do Discord ao longo da sessao para confirmar se:

- o usuario ainda tem permissao administrativa
- o bot continua instalado na guild

Se essa verificacao reprovar:

- a guild sai da sessao web
- mutacoes deixam de funcionar imediatamente
- o painel pode cair para `Sem guilds elegiveis`
- sessoes antigas pre-`v2.0.2` podem exigir novo login

## Configuracao

Variaveis de ambiente novas:

```env
DISCORD_CLIENT_SECRET=
DASHBOARD_ENABLED=false
DASHBOARD_BASE_URL=http://localhost:3000
DASHBOARD_PORT=3000
DASHBOARD_SESSION_SECRET=
```

Regras:

- se `DASHBOARD_ENABLED=false`, o bot sobe sem superficie web
- se `DASHBOARD_ENABLED=true`, mas faltar config minima, o bot continua subindo e o `doctor` registra o motivo
- o dashboard so fica realmente ativo quando houver:
  - `DISCORD_CLIENT_SECRET`
  - `DASHBOARD_BASE_URL`
  - `DASHBOARD_SESSION_SECRET`

## Rotas publicas

### HTML

- `GET /dashboard`
- `GET /dashboard/login`
- `GET /dashboard/callback`
- `POST /dashboard/logout`

### API

- `GET /api/dashboard/me`
- `GET /api/dashboard/guilds`
- `GET /api/dashboard/guilds/:guildId/overview`
- `GET /api/dashboard/guilds/:guildId/doctor`
- `GET /api/dashboard/guilds/:guildId/incidents`
- `GET /api/dashboard/guilds/:guildId/settings`
- `GET /api/dashboard/guilds/:guildId/session`
- `PATCH /api/dashboard/guilds/:guildId/settings`
- `POST /api/dashboard/guilds/:guildId/recover`
- `POST /api/dashboard/guilds/:guildId/stop`

Todas as rotas operam sobre DTOs/use cases de alto nivel. O painel nao expoe Prisma cru nem detalhes de `discord-player` na camada HTTP.

## Como subir

### Bot sem dashboard

```powershell
npm run build
npm run start
```

### Bot com dashboard

```powershell
$env:DASHBOARD_ENABLED='true'
npm run build
npm run start
```

Se o dashboard estiver ativo, o runtime registra `PHONIX dashboard online`.

## Validacao recomendada

### Automatizada

- `npm run verify:dashboard`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:smoke`

### Manual

- validar login OAuth contra Discord real
- validar caso de usuario sem guilds elegiveis
- validar acesso administrativo a uma guild com o bot instalado
- validar `PATCH /settings`
- validar `recover`
- validar `stop`
- validar dashboard desabilitado por env
- validar revogacao de admin ou bot removido com revalidacao da sessao
- validar refresh OAuth e novo login quando necessario

## Estado honesto da release

- a integracao de codigo da `v2.x` esta implementada
- a cobertura automatizada agora cobre env parsing, callback OAuth, sessao expirada, logout, CSRF, overview, diagnostics, config web, `recover`, `stop`, revalidacao de autorizacao, sessao sem guilds elegiveis e falha de refresh OAuth
- `PARCIAL`: o fluxo OAuth manual em Discord real ainda depende de rodada manual
- `PARCIAL`: a UX visual final do dashboard ainda depende de validacao manual fora dos testes automatizados
