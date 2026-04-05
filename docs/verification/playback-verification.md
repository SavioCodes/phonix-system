# PHONIX Playback Verification

## Contexto da `v2.x`

Na `v2.x`, o PHONIX ganhou um `Admin Center` web, mas esta verificacao continua sendo centrada no bot Discord. O dashboard ajuda a inspecionar `doctor`, config e estado da sessao, porem a comparacao A/B de playback ainda deve ser validada dentro de canais de voz reais no Discord. Na `v2.2.0`, `play`, `queue`, `nowplaying`, `config view` e `doctor` passam a usar `Components V2` de forma seletiva, e o `doctor` continua mostrando `session health`, o que ajuda a diferenciar recovery saudavel, parcial ou quebrado antes da rodada manual.

## Objetivo

Verificar de forma repetivel a diferenca operacional entre os perfis `compatibility` e `fidelity` do YouTube, comparando o comportamento do bot em canais com bitrate:

- `64 kbps`
- `128 kbps`
- `256 kbps`
- `384 kbps`

O foco desta fase e validar:

- estabilidade do stream
- suavidade do playback
- tempo ate o primeiro audio
- quantidade de stutters
- coerencia entre perfil solicitado e perfil efetivo
- leitura correta do `doctor`
- clareza do resultado final de `/play` entre `tocando agora` e `aguardando na fila`
- painel visual de `nowplaying` com artwork/capa e origem coerente com a faixa atual
- painel visual de `recover` com contagem coerente de restauradas/puladas e leitura real de session health
- paineis de biblioteca (`favorite list`, `playlist list`, `history`) com boa escaneabilidade, sem poluicao visual e com artwork quando a metadata existir

## Artefatos desta fase

- `docs/verification/playback-verification.md`: runbook operacional da comparacao A/B.
- `docs/verification/playback-verification-results.md`: folha de resultado do ambiente atual, incluindo estado local confirmado e a matriz manual ainda em aberto quando aplicavel.
- `docs/verification/admin-center-verification.md`: runbook separado da superficie web, para nao misturar verificacao de playback com validacao do painel administrativo.

## Limites importantes

- O teto final de qualidade continua limitado pelo bitrate do canal do Discord.
- `YOUTUBE_HIGH_WATER_MARK` ajuda suavidade e tolerancia do stream; isso nao e sinonimo de fidelidade.
- O perfil `fidelity` so deve ser comparado de verdade quando `YOUTUBE_COOKIE` estiver configurado e valido.
- Nao use links do Spotify para comparar fidelidade. Spotify hoje funciona por bridge.
- Se a guild nao oferecer `256` ou `384 kbps`, marque essas linhas como indisponiveis.
- O `Admin Center` nao substitui esta fase: use-o como apoio de leitura operacional, mas mantenha `/doctor` e `/play` como referencia final durante a rodada manual.

## Validacao automatica local

Rode:

```bash
npm run verify:playback
```

Esse script executa:

- `npm run typecheck`
- `npm run build`
- `npm test`
- `npm run test:smoke`

E depois imprime:

- o estado atual do perfil/pipeline configurado
- uma matriz A/B para `64/128/256/384 kbps`
- um checklist manual para o Discord

Se o ambiente ja estiver com `fidelity` efetivo, o proximo passo e registrar esse estado em `docs/verification/playback-verification-results.md` e partir para a comparacao manual no Discord.

## Preparacao manual

1. Garanta que o bot esteja configurado com:
   - `DISCORD_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DATABASE_URL`
   - `BOT_PREFIX`
   - `FFMPEG_PATH` quando necessario
2. Se quiser comparar `fidelity` de verdade, configure tambem:
   - `YOUTUBE_PLAYBACK_PROFILE=fidelity`
   - `YOUTUBE_COOKIE=...`
3. Use a mesma faixa ou URL do YouTube em todas as rodadas para reduzir variacao.
4. Prepare, quando possivel, canais de voz com:
   - `64 kbps`
   - `128 kbps`
   - `256 kbps`
   - `384 kbps`

## Procedimento A/B

Para cada bitrate, execute duas rodadas:

### Rodada A - `compatibility`

```powershell
$env:YOUTUBE_PLAYBACK_PROFILE='compatibility'
npm run start
```

Dentro do Discord:

1. Entre no canal de voz do bitrate alvo.
2. Rode `/doctor`.
3. Confirme:
   - `Voice playback target` com o bitrate esperado
   - `Playback pipeline` com perfil solicitado/efetivo em `compatibility`
   - pipeline do YouTube em `youtube-dl`
4. Rode `/play <mesma-faixa-ou-url>`.
5. Observe por pelo menos `90s`:
   - tempo ate o primeiro audio
   - stutters
   - falhas de stream
   - recoveries
   - diferenca audivel percebida
   - se o resultado do `/play` explicou claramente entrada na call, reaproveitamento de sessao ou fila
   - se o painel de `nowplaying` mostrou thumbnail/capa, origem e link de forma coerente
6. Depois do primeiro playback da rodada, valide tambem:
   - `/recover` quando houver sessao salva, confirmando painel, contagem e hints
   - `/favorite list`
   - `/playlist list`
   - `/history`
7. Registre se os paineis continuaram legiveis tanto em desktop quanto em mobile.

### Rodada B - `fidelity`

```powershell
$env:YOUTUBE_PLAYBACK_PROFILE='fidelity'
npm run start
```

Dentro do Discord:

1. Entre no mesmo canal de voz do bitrate alvo.
2. Rode `/doctor`.
3. Confirme:
   - `Voice playback target` com o bitrate esperado
   - `Playback pipeline` com perfil solicitado/efetivo
   - se `fidelity` ficou realmente efetivo ou caiu para `compatibility`
   - pipeline do YouTube em `youtubei` quando `fidelity` estiver ativo
4. Rode `/play <mesma-faixa-ou-url>`.
5. Observe por pelo menos `90s`:
   - tempo ate o primeiro audio
   - stutters
   - falhas de stream
   - recoveries
   - diferenca audivel percebida
   - se o resultado do `/play` continuou claro mesmo com downgrade ou bloqueio de pipeline
   - se o painel de `nowplaying` manteve artwork/capa e origem coerentes no perfil efetivo
6. Se houver sessao salva ou itens em biblioteca, repita:
   - `/recover`
   - `/favorite list`
   - `/playlist list`
   - `/history`
7. Registre tambem se a densidade visual continua boa em desktop e mobile quando `session health` estiver parcial ou quando `fidelity` cair para `compatibility`.

## Planilha de resultado sugerida

| Bitrate | Perfil pedido | Perfil efetivo | Pipeline | Tempo ate audio | Stutters em 90s | Falhas | Recovery | Observacao auditiva | Veredito |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64 kbps | compatibility |  |  |  |  |  |  |  |  |
| 64 kbps | fidelity |  |  |  |  |  |  |  |  |
| 128 kbps | compatibility |  |  |  |  |  |  |  |  |
| 128 kbps | fidelity |  |  |  |  |  |  |  |  |
| 256 kbps | compatibility |  |  |  |  |  |  |  |  |
| 256 kbps | fidelity |  |  |  |  |  |  |  |  |
| 384 kbps | compatibility |  |  |  |  |  |  |  |  |
| 384 kbps | fidelity |  |  |  |  |  |  |  |  |

## Criterios de leitura

- Se `fidelity` cair para `compatibility`, a rodada deve ser marcada como bloqueada e nao como comparacao valida.
- Se o bitrate do canal mudar, a comparacao anterior deixa de ser equivalente.
- Se a mesma URL tocar com menos stutters no mesmo bitrate, isso conta como ganho de estabilidade.
- Se `fidelity` piorar estabilidade sem ganho perceptivel claro, o ambiente provavelmente deve ficar em `compatibility`.

## Resultado esperado

Ao final da fase, deve ficar claro:

- se o ambiente atual suporta `fidelity` de forma real
- em quais bitrates a diferenca e perceptivel
- se o ganho vem de suavidade, tolerancia ou percepcao auditiva
- se o perfil padrao do servidor deve continuar em `compatibility`
- se o artefato de resultado final em `docs/verification/playback-verification-results.md` ja pode ser marcado como completo ou se ainda esta `PARCIAL`
