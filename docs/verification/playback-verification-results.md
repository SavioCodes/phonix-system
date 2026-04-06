# PHONIX Playback Verification Results

## Status do artefato

- Ultima atualizacao: `2026-04-05`
- Estado geral: `PARCIAL`
- Contexto de release: `v2.3.0`
- Leitura honesta: o ambiente local confirma `compatibility` funcional, mas o caminho nativo `fidelity/youtubei` continua falhando em `decipher`; por isso o PHONIX agora quarentena esse caminho e degrada o runtime para `compatibility` ainda no startup quando esse probe falha.

## Estado atual detectado

Resultado confirmado por `npm run verify:playback` no ambiente atual:

- Spotify habilitado: `sim`
- Perfil solicitado por padrao: `fidelity`
- Perfil efetivo atual: `compatibility`
- Pipeline atual do YouTube: `youtube-dl`
- Client atual do YouTube: `WEB`
- Cookie configurado: `sim`
- Spotify route atual: `spotify-bridge (bridge)`
- Probe local de `youtubei`: `falhou com No valid URL to decipher`
- Leitura direta de `youtube-dl`: `ok`

## Leitura atual

- `compatibility` esta pronto para uso real no ambiente atual.
- `fidelity/youtubei` esta `BLOQUEADO NESTE AMBIENTE` por falha upstream de `decipher`.
- o runtime do PHONIX detecta esse bloqueio no startup e sobe degradado para `compatibility`, evitando a primeira tentativa quebrada e tratando `compatibility` como caminho operacional efetivo desta instalacao.
- a rodada automatizada da `v2.3.0` agora cobre contrato de `Components V2`, acoes de painel, atualizacao repetida da mesma mensagem e a nova library acionavel por destaque.
- a rodada visual nova de `play`/`queue`/`nowplaying` continua `PARCIAL` ate validacao manual no Discord real, porque a suite automatica garante o contrato e a atualizacao em-place, mas nao a percepcao final dentro do cliente Discord.
- a rodada interativa da `v2.3.0` tambem continua `PARCIAL` no cliente real: `queue`, `nowplaying`, `recover`, `config`, `doctor`, `favorite list`, `playlist list` e `history` ja estao protegidos por teste, mas ainda falta leitura ergonomica final em desktop/mobile.
- houve uma tentativa real de abrir o Discord web por automacao nesta maquina, inclusive reaproveitando um perfil local do navegador, mas nao havia sessao autenticada disponivel; a validacao manual ficou bloqueada por login ausente, nao por falta de runbook ou cobertura automatizada.

## Matriz A/B do ambiente atual

| Bitrate | Perfil pedido | Perfil efetivo | Pipeline | Client | Pronto | Bloqueio | Tempo ate audio | Stutters em 90s | Falhas | Recovery | Observacao auditiva | Veredito |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64 kbps | compatibility | compatibility | youtube-dl | WEB | sim | - | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 64 kbps | fidelity | compatibility | youtube-dl | WEB | sim | probe de startup degradou por `No valid URL to decipher` | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 128 kbps | compatibility | compatibility | youtube-dl | WEB | sim | - | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 128 kbps | fidelity | compatibility | youtube-dl | WEB | sim | probe de startup degradou por `No valid URL to decipher` | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 256 kbps | compatibility | compatibility | youtube-dl | WEB | sim | - | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 256 kbps | fidelity | compatibility | youtube-dl | WEB | sim | probe de startup degradou por `No valid URL to decipher` | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 384 kbps | compatibility | compatibility | youtube-dl | WEB | sim | - | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |
| 384 kbps | fidelity | compatibility | youtube-dl | WEB | sim | probe de startup degradou por `No valid URL to decipher` | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE | PENDENTE |

## Proximo passo necessario

O ambiente local nao esta pronto para comparar `compatibility` vs `fidelity` como se os dois estivessem estaveis. Hoje a comparacao honesta depende de tratar `fidelity/youtubei` como caminho bloqueado e automaticamente isolado pelo runtime neste host.

Proxima sequencia recomendada:

1. Rode `npm run verify:playback`
2. Rode no PowerShell:

```powershell
$env:YOUTUBE_PLAYBACK_PROFILE='compatibility'; npm run start
$env:YOUTUBE_PLAYBACK_PROFILE='fidelity'; npm run start
```

3. Em cada rodada, use `/doctor` antes do `/play`
4. Confirme tambem se o resultado do `/play` explicou com clareza a entrada na call e se o `nowplaying` mostrou artwork/origem coerentes
5. Valide tambem `/recover`, `/favorite list`, `/playlist list` e `/history`, marcando se:
   - o painel continua escaneavel em desktop e mobile
   - artwork/capa so aparece quando houver metadata real
   - hints e labels continuam claros em sessao parcial/quebrada
6. Nas superficies acionaveis da `v2.3.0`, marque tambem se:
   - `queue` atualiza no mesmo painel sem abrir mensagem nova
   - `nowplaying` pausa/retoma sem perder o contexto do painel
   - `recover` navega bem para `queue`, `nowplaying` e `doctor`
   - `config` e `doctor` conseguem alternar contexto com leitura clara e sem poluicao visual
7. Preencha as colunas `PENDENTE` desta tabela com os resultados reais no Discord, mas mantendo a leitura de que `fidelity` pode degradar antes do primeiro `/play`

Quando a matriz estiver completa, este documento pode sair de `PARCIAL` e virar o registro final da Fase 4, mas sem fingir que o caminho nativo do `youtubei` esta saudavel neste ambiente se isso nao se confirmar.

## Observacao importante

- Spotify nao deve ser usado como base para comparar fidelidade porque hoje o playback entra por bridge.
- O `Admin Center` da `v2.x` pode ajudar a inspecionar a guild, mas a comparacao A/B continua precisando de rodada manual no Discord real.
- A linha `v2.0.x` adicionou uma verificacao dedicada do painel em `npm run verify:dashboard`, mas isso nao substitui a rodada auditiva de playback.
- `NAO IMPLEMENTADO AINDA`: `source:soundcloud` como alternativa futura de source direto.
