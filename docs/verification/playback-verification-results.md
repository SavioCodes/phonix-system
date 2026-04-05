# PHONIX Playback Verification Results

## Status do artefato

- Ultima atualizacao: `2026-04-05`
- Estado geral: `PARCIAL`
- Contexto de release: `v2.2.0`
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
- a rodada visual nova de `play`/`queue`/`nowplaying` continua `PARCIAL` ate validacao manual no Discord real, porque a suite automatica garante o contrato de `Components V2`, mas nao a percepcao final dentro do cliente Discord.

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
5. Preencha as colunas `PENDENTE` desta tabela com os resultados reais no Discord, mas mantendo a leitura de que `fidelity` pode degradar antes do primeiro `/play`

Quando a matriz estiver completa, este documento pode sair de `PARCIAL` e virar o registro final da Fase 4, mas sem fingir que o caminho nativo do `youtubei` esta saudavel neste ambiente se isso nao se confirmar.

## Observacao importante

- Spotify nao deve ser usado como base para comparar fidelidade porque hoje o playback entra por bridge.
- O `Admin Center` da `v2.x` pode ajudar a inspecionar a guild, mas a comparacao A/B continua precisando de rodada manual no Discord real.
- A linha `v2.0.x` adicionou uma verificacao dedicada do painel em `npm run verify:dashboard`, mas isso nao substitui a rodada auditiva de playback.
- `NAO IMPLEMENTADO AINDA`: `source:soundcloud` como alternativa futura de source direto.
