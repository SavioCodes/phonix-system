# PHONIX Admin Center Verification

## Objetivo

Este runbook existe para validar a superficie web administrativa da linha `v2.x` sem misturar essa frente com a verificacao de playback.

Ele cobre:

- disponibilidade do `Admin Center`
- login OAuth com Discord
- filtragem real de guilds
- revalidacao de autorizacao durante a sessao
- mutacoes administrativas seguras (`config`, `recover`, `stop`)

## Verificacao automatica

Use:

```powershell
npm run verify:dashboard
```

Esse script executa:

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:smoke`

e depois imprime o checklist manual da release web.

## Pre-condicoes

- `DASHBOARD_ENABLED=true`
- `DASHBOARD_BASE_URL` configurado
- `DASHBOARD_SESSION_SECRET` configurado
- `DISCORD_CLIENT_SECRET` configurado
- callback OAuth registrado no Discord como:

```text
<DASHBOARD_BASE_URL>/dashboard/callback
```

## Rodada manual recomendada

1. Suba o bot:

```powershell
npm run start
```

2. Abra o `Admin Center` em:

```text
<DASHBOARD_BASE_URL>/dashboard
```

3. Valide o login OAuth.

4. Confirme que a lista de guilds mostra apenas servidores em que:

- o bot esteja instalado
- a conta autenticada ainda tenha permissao administrativa

5. Abra uma guild elegivel e revise:

- `Overview`
- `Config`
- `Diagnostics`
- `Operations`

6. Altere `prefix`, `defaultVolume`, `autoplayEnabled` e `resumeQueueEnabled`.

7. Execute `recover` e `stop`.

8. Revogue o acesso administrativo da conta ou remova o bot da guild e valide:

- que a guild deixa de aparecer apos a revalidacao
- que mutacoes deixam de funcionar imediatamente
- que o painel cai para `Sem guilds elegiveis` quando nenhuma guild valida restar

9. Force expiracao ou falha do OAuth e confirme que o painel exige novo login.

## Estado honesto

- a verificacao automatica cobre wiring, CSRF, callback OAuth, sessao expirada, revalidacao de autorizacao, refresh com falha e mutacoes administrativas
- `PARCIAL`: o fluxo OAuth real ainda depende de rodada manual no Discord
- `PARCIAL`: a UX visual final do painel continua dependendo de validacao manual em navegador real
