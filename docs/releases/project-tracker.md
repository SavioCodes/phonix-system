# PHONIX Project Tracker

## Analise Atual

- A base do projeto ja esta separada por camadas (`app`, `core`, `modules`) e sustenta novas features sem acoplar bootstrap, Discord, persistencia e UI.
- A etapa `v1.2.0` fechou o gap de configuracao por servidor com comandos administrativos e persistencia reutilizada.
- O foco seguinte passou a ser operacao e suporte em ambiente real: diagnosticar FFmpeg, banco, intents, deploy de slash commands e permissoes do bot sem depender de leitura manual de logs.
- A etapa `v1.3.0` cobre esse ponto com um modulo de diagnostico centralizado e checklist operacional atualizado.
- A etapa mais recente endureceu o runtime do bot para Windows bloqueado por App Control, corrigindo bootstrap de producao, caminho de build e compatibilidade de voz sem DAVE.
- A revisao `v1.4.1` fechou o ultimo gap dessa correcao: o `daveEncryption: false` agora entra no ponto real de conexao de voz do `discord-player`, com cobertura de testes ampliada para `play`, `join` e criacao de fila.
- A revisao `v1.4.2` estabilizou o playback do YouTube com fallback de stream via `youtube-dl`, depois de reproduzir localmente o erro `ERR_NO_RESULT` do backend `youtubei`.
- A revisao `v1.4.3` alinhou a resolucao interna de FFmpeg do `discord-player` com o executavel configurado no `.env`, eliminando a divergencia entre health check e runtime de playback.
- A etapa `v1.6.0` consolidou um novo nucleo de execucao de comandos com erros tipados, precondicoes centralizadas, resposta unica por comando, telemetria estruturada e pipeline CI para build + test.
- A revisao `v1.6.1` endureceu o runtime de playback: timeout de voz maior, watcher de `PlayerStart` para evitar falso sucesso no `/play`, normalizacao de URLs do YouTube e menos ruido de logs para erros controlados.
- A etapa `v1.7.0` adicionou persistencia de fila por guild, retomada hibrida apos restart, comando `recover`, `config resumequeue`, diagnostico de sessao persistida e migrations incrementais para upgrades do SQLite.
- A etapa `v1.8.0` aprofundou a operacao do bot: telemetria por guild, classificacao de falhas, retry/abort de recovery, `doctor` operacional e smoke tests de eventos reais de voz/player.
- A revisao `v1.8.1` persistiu o historico operacional em SQLite, levou esse historico para o `doctor` e tratou warnings upstream conhecidos de forma controlada no runtime do app.
- A etapa `v1.9.0` desacoplou a camada de comandos: a regra principal agora mora em use cases por dominio, os comandos viraram adaptadores finos e `typecheck` entrou como gate oficial da pipeline.
- A revisao `v1.9.1` transformou o `help` em uma central interativa de onboarding, com navegacao por paginas e contexto real do servidor.
- A revisao `v1.9.2` endureceu o `play`/`tocar`: modos de fila, source opcional, parse de flags em prefixo e respostas mais informativas sem perder o fluxo simples.
- A revisao `v1.9.3` levou o `play` para um nivel mais robusto: preflight de voz/permissoes, erro diferenciado por etapa, limite seguro de playlist/fila e feedback visual mais completo.
- A revisao `v1.9.4` elevou o sistema completo de comandos: erros guiados, consistencia real entre slash e prefixo, biblioteca/admin mais claros, `doctor` com proximos passos e documentacao finalmente alinhada ao comportamento atual.
- A revisao `v1.9.5` limpou o catalogo publico: `join`, `leave` e `autoplay` standalone sairam de cena para reduzir redundancia e concentrar o fluxo real em `play`, `recover`, `stop` e `config autoplay`.
- A revisao `v1.9.6` corrigiu a leitura operacional do pipeline: o `doctor` agora diferencia configuracao real de stream, bitrate do canal alvo, route bridge/nativa e ultima rota observada pela telemetria.
- A revisao `v1.9.7` introduziu perfis de playback controlados para o YouTube, com `compatibility` como padrao seguro e `fidelity` como opt-in protegido por cookie/config valida.
- A revisao `v1.9.8` fechou a clareza de source: `play`, `help` e `doctor` agora deixam explicito que Spotify hoje funciona por bridge, e o roadmap passou a registrar `source:soundcloud` como possibilidade futura ainda nao implementada.
- A revisao `v1.9.9` fechou a fase de verificacao com um runbook A/B de bitrate/perfil e um script oficial para repetir `typecheck`, `build`, `test`, `test:smoke` e preparar o teste manual no Discord.
- A etapa `v2.0.0` transforma o PHONIX em um produto de duas superficies sem quebrar a experiencia atual: o bot Discord segue como interface principal e um `Admin Center` web opt-in passa a reutilizar `config`, `doctor`, telemetria, recovery e estado de sessao.
- O novo painel roda no mesmo runtime com `Fastify`, autenticacao por Discord OAuth, sessoes persistidas em SQLite, cookie HTTP-only assinado e CSRF para mutacoes.
- A `v2.0.0` tambem consolida a release publica: `package.json`, versao do app, `doctor`, startup log e rodape do dashboard agora se alinham em `2.0.0`.
- A revisao `v2.0.1` corrige a fragilidade da suite no Windows: bootstrap SQLite e testes de integracao com Prisma deixaram de depender do timeout padrao curto do Vitest.
- A revisao `v2.0.2` endurece o `Admin Center` para uso administrativo real: a autorizacao web deixa de ser snapshot puro do login e passa a ser revalidada ao longo da sessao.
- A revisao `v2.0.3` volta o foco para a experiencia dentro do Discord: comandos, embeds e respostas administrativas ficaram mais claros, mais guiados e mais coerentes visualmente.
- A revisao `v2.0.4` foca saneamento tecnico: menos utilitario morto, menos duplicacao em testes, verificacao operacional melhor posicionada e estrutura mais facil de navegar.
- A revisao `v2.0.5` adiciona um eixo novo de operacao: owner access centralizado, DM automatica de online, namespace `/owner` e leitura dedicada da guild oficial.
- A revisao `v2.1.0` fortalece a continuidade operacional por guild com `Smart Session`: recovery mais claro, session health estruturada, deteccao de sessao parcial/quebrada e melhor leitura em `recover`, `queue`, `nowplaying` e `doctor`.
- A revisao `v2.2.0` abre uma linha nova de superficie Discord: paineis densos migraram seletivamente para `Components V2`, enquanto `help` e notices compactos continuam classicos para preservar ergonomia, compatibilidade e manutencao.
- A revisao `v2.3.0` transforma essa base em um interaction system: `queue`, `nowplaying`, `recover`, `config` e `doctor` deixam de ser superficies so de leitura e passam a aceitar acoes rapidas com atualizacao do mesmo painel.
- O passe seguinte ainda dentro da mesma linha `v2.2.0` levou os itens mais fortes da fila curta para o mesmo patamar visual: `recover`, `favorite list`, `playlist list` e `history` agora usam paineis dedicados, em vez de notices genéricos.
- O passe visual mais recente da linha `v2.1.0` reforca a apresentacao dentro do Discord: notices com campos e hint contextual, `play` mais escaneavel, `queue` e `nowplaying` com cara de painel de sessao e `config`/`doctor` organizados por blocos de leitura rapida.
- O hardening mais recente dentro da mesma linha fechou gaps de UX e dominio ainda reais: favoritos/playlists agora explicam origem do atalho e impacto na sessao, `config` passou a devolver validacoes de prefixo/volume com titulos claros e `help`/`admin` mostram melhor o estado atual da guild.
- O passe seguinte ainda dentro da mesma linha aprofundou a clareza operacional: `loop` ficou mais legivel no slash e no prefixo, `history` e a biblioteca passaram a orientar melhor reuso real, e a ajuda passou a sugerir o atalho certo com base no estado atual da guild.
- Um ajuste adicional de UX ainda dentro da mesma linha reduziu a ambiguidade dos erros controlados de playback: falhas ao abrir stream agora chegam com leitura tecnica curta, menos repeticao textual e orientacao melhor para `/doctor`.
- O hardening mais recente ainda dentro da mesma linha fechou um bug real de classificacao de erro: quando o recovery encontrava a sessao salva, mas ela nao continuava tocavel, a resposta podia cair como stream generico; agora o PHONIX diferencia corretamente `Recovery indisponivel agora` de `Stream indisponivel agora`.
- Um ajuste adicional ainda dentro da mesma linha corrigiu outro atrito real de troubleshooting: falhas de stream que antes podiam chegar com `Origem/Pipeline desconhecido` agora reaproveitam a rota real da tentativa quando ela existe e, quando nao existe, assumem um fallback honesto sem ruir para `desconhecida/desconhecido`.
- O hardening seguinte fechou o ultimo gap desse fluxo: quando o `playerError` chegava pelo watcher antes do primeiro audio, a rota da tentativa ainda podia se perder; agora o contexto da busca segue ate a resposta final do comando.
- O ajuste seguinte fechou outra inconsistência real de leitura tecnica: quando o runtime observava `_SoundCloudExtractor.stream` como fallback interno, a resposta ainda podia dizer `YouTube/youtube-dl`; agora ela prioriza a rota observada e deixa explicito que isso nao significa `source:soundcloud` publico.
- O endurecimento seguinte fechou a causa operacional desse ruído: como `source:soundcloud` continua nao implementado publicamente, o PHONIX agora deixa de carregar o `SoundCloudExtractor` no bundle padrao e tambem bloqueia stream vindo dele no `Player`.
- O ajuste seguinte fechou um bug estrutural de classificacao: helpers que inferiam rota de YouTube usavam `compatibility/youtube-dl` por padrao, mesmo quando a instancia real estava em `fidelity/youtubei`; agora a classificacao de erro, telemetria e paines reaproveita a configuracao real do runtime.
- O ajuste seguinte fechou outro atrito operacional que ainda poluia o `doctor`: falhas de stream nao deixam mais uma fila vazia presa como `active/healthy`, e o diagnostico voltou a tratar esse resquicio como ausencia de fila ativa.
- O erro controlado tambem ficou mais pratico para troubleshooting real em `fidelity`: quando a rota falha em `YouTube/youtubei`, o PHONIX passa a sugerir `compatibility` como contraprova objetiva do pipeline atual.
- O endurecimento seguinte saiu da explicacao e entrou em mitigacao real: quando um stream falha de verdade em `fidelity/youtubei`, o runtime agora pode degradar a rota ativa para `compatibility/youtube-dl`, repetir a tentativa uma vez e deixar esse downgrade auditavel em `doctor`, dashboard e owner ops.
- A rodada seguinte fechou o atrito do primeiro comando quebrado no ambiente real: pesquisa e probes locais confirmaram falha upstream de `decipher` no caminho nativo do `youtubei`, entao o runtime passou a habilitar `PoToken` em `fidelity/WEB` e executar um probe curto no startup; se ele falhar, o bot ja sobe em `compatibility/youtube-dl` sem esperar o primeiro `/play` quebrar.
- A suite tambem ganhou endurecimento concreto: `Vitest` agora exige assertions por teste, e comandos/use cases antes pouco protegidos (`help`, `history`, `doctor`, `stop`, `nowplaying`, `setDefaultVolume`) passaram a ter cobertura direta.
- O hardening mais recente desta mesma linha fechou dois bugs reais de runtime vistos em producao: expiracao de slash interaction nao derruba mais o processo com `Unknown interaction`, e o descarte de fila em falha/recovery ficou idempotente mesmo quando o `discord-player` ja removeu a queue antes do cleanup.
- A mesma rodada tambem reduziu ruido operacional de recovery: eventos de runtime deixam de promover para `warn` o que ja e um abort esperado apos janela esgotada, preservando warning apenas para falhas realmente inesperadas do handler.
- O painel agora persiste tokens OAuth cifrados em SQLite, poda sessoes expiradas no startup e invalida a sessao quando o refresh OAuth falha.
- A postura publica do repositorio tambem foi endurecida sem inventar release nova: a documentacao saiu do layout achatado em `docs/`, ganhou mapa por responsabilidade, politica de release, perfil de repositorio, templates do GitHub e CI com smoke tests.
- A regra operacional do projeto tambem ficou explicita: toda mudanca relevante no bot precisa sincronizar documentacao e repositorio antes de ser tratada como concluida.
- O ambiente local ja foi validado com `fidelity` efetivo, `youtubei` ativo e client `WEB`, e o runtime agora tambem consegue degradar para `compatibility` de forma auditavel quando a abertura real do stream falhar.
- O passe mais recente da linha `v2.1.0` tambem melhorou a UX perceptiva do Discord sem abrir uma nova superficie: o resultado do `play` agora diferencia melhor preparo de conexao, reaproveitamento da sessao e start real da faixa.
- A mesma rodada fortaleceu a apresentacao visual da musica atual: `nowplaying`, `queue` e respostas de `play` agora reaproveitam thumbnail/capa, link da faixa e origem resumida quando esse metadata existe no runtime.
- O gap remanescente desta frente e manual e operacional: a matriz A/B em canais de `64/128/256/384 kbps` ainda precisa ser preenchida no Discord real para concluir a leitura auditiva e de estabilidade.
- `docs/verification/playback-verification.md` virou o runbook oficial da fase e `docs/verification/playback-verification-results.md` passou a registrar o estado real do ambiente e a matriz final.

## Versoes

### Repository hardening - GitHub readiness

- [x] Reorganizar `docs/` por responsabilidade real
- [x] Criar mapa de documentacao em `docs/README.md`
- [x] Adicionar perfil de repositorio e politica de release em `docs/governance/`
- [x] Reescrever `README.md` para a exposicao publica real do PHONIX
- [x] Atualizar metadados do `package.json` para o perfil recomendado do repositorio
- [x] Adicionar `LICENSE`, `CONTRIBUTING`, `CODEOWNERS`, issue templates e PR template
- [x] Adicionar `SECURITY.md`, `.editorconfig` e endurecer `.gitignore` para a exposicao publica
- [x] Incluir `test:smoke` na pipeline de CI
- [x] Criar o repositorio remoto `phonix-system` no GitHub e aplicar os topicos recomendados

### `v2.3.0` - Discord Interaction System

- [x] Confirmar a versao atual real em runtime, docs, versionamento e tag publica antes de abrir a nova linha
- [x] Revalidar docs oficiais do Discord, `discord.js` e `discord-player` para a fase de interacao
- [x] Identificar o que a `v2.2.0` resolveu e o que ainda ficou `PARCIAL` em UX, praticidade e Components V2
- [x] Formalizar um interaction system dedicado para paines acionaveis em `panelActions.ts` e `panelInteractions.ts`
- [x] Tornar `play`, `queue`, `nowplaying`, `recover`, `config view` e `doctor` superficies acionaveis quando a acao fizer sentido real
- [x] Atualizar o mesmo painel em vez de criar novas mensagens para refresh, pause/resume, shuffle e toggles administrativos
- [x] Preservar a estrategia hibrida: `help` continua classico por ergonomia, enquanto a biblioteca ganha acoes rapidas de destaque sem abandonar os fluxos explicitos por nome/indice
- [x] Expor no painel o estado operacional que orienta a interacao, como `playbackStateLabel` e navegacao restrita ao usuario que abriu a superficie
- [x] Integrar o roteamento das interacoes ao `InteractionCreate` sem criar uma segunda arquitetura de comandos
- [x] Tornar `favorite list`, `playlist list` e `history` superficies acionaveis com botoes de destaque quando isso reduzir atrito real
- [x] Proteger por teste as atualizacoes repetidas no mesmo painel para `queue`, `nowplaying`, `recover`, `config` e `doctor`
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER`, `CHANGELOG`, `RELEASE_POLICY` e runbooks de verificacao impactados
- [x] Alinhar runtime e versao publica para `2.3.0`
- [x] Publicar a tag e a release publica `v2.3.0` no GitHub
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`
- [x] Tentar a rodada manual no Discord web por automacao local e registrar que ela ficou bloqueada por ausencia de sessao autenticada neste ambiente
- [ ] Validar manualmente a ergonomia final dos paineis acionaveis no cliente Discord desktop/mobile
- [ ] Validar em Discord real se `queue`, `nowplaying`, `recover`, `config` e `doctor` continuam claros quando atualizados repetidamente no mesmo painel
- [x] Decidir a linha da biblioteca na `v2.3.0`: ela ganha acoes de destaque por botao, mas mutacoes precisas continuam command-driven

### `v2.2.0` - Signal Surfaces

- [x] Confirmar a versao atual real em runtime, docs e release publica antes de abrir a nova linha
- [x] Reanalisar docs oficiais do Discord, `discord.js` e `discord-player` antes de decidir a estrategia visual
- [x] Introduzir um design system hibrido para mensagens do Discord, com assets de branding reais do PHONIX
- [x] Adotar `Components V2` em `play`, `queue`, `nowplaying`, `config view` e `doctor`
- [x] Promover `recover` para um painel dedicado de recovery, sem rebaixar o fluxo a notice generico
- [x] Promover `favorite list`, `playlist list` e `history` para paineis de colecao com metadata visual quando houver artwork salvo
- [x] Manter `help`, notices compactos e fluxos de biblioteca em embeds/classic action rows por criterio de ergonomia e manutencao
- [x] Remover a dependencia de emoji como linguagem visual principal na camada de superficie Discord
- [x] Reorganizar a hierarquia visual de `queue`, `nowplaying`, `doctor` e `config`
- [x] Mover o loading visual do slash `play` para o estado nativo de defer do Discord, preservando o payload final em `Components V2`
- [x] Expandir o runbook da `v2.2.0` para incluir validacao visual de `recover` e das superficies principais da library
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER`, `CHANGELOG` e docs operacionais/verification impactadas
- [x] Alinhar runtime e versao publica para `2.2.0`
- [ ] Validar manualmente a leitura final dos paineis `Components V2` no cliente Discord desktop/mobile
- [ ] Validar manualmente `recover`, `favorite list`, `playlist list` e `history` em Discord real com foco em densidade, artwork e hints
- [ ] Confirmar em ambiente real se a densidade visual continua boa em guilds com `session health` parcial ou quebrada

### `v2.1.0` - Smart Session

- [x] Reanalisar docs, music, recovery, diagnostics, commands e UI antes de mexer no fluxo de sessao
- [x] Confirmar no codigo real o que a sessao persistida ja restaurava e o que ainda faltava sinalizar
- [x] Enriquecer o resultado interno de recovery com contagem real de faixas salvas, restauradas e puladas
- [x] Tornar explicita a diferenca entre sessao saudavel, recuperavel, parcial, quebrada e desativada
- [x] Expor `session health` e `recoveryReady` no diagnostico por guild
- [x] Melhorar `recover` com feedback sobre faixa atual salva, configuracao reaplicada e recovery parcial
- [x] Melhorar `queue` e `nowplaying` com painel de session health, ultimo recovery e rota atual de playback
- [x] Fortalecer `doctor` com leitura de sessao persistida, fila ao vivo, ultimo bloqueio e necessidade de intervencao manual
- [x] Adicionar sinais operacionais para `session_pending`, `session_restored`, `session_partial` e `session_broken`
- [x] Diferenciar visualmente `success`, `info`, `warning` e `error` na camada de embeds
- [x] Transformar notices em respostas estruturadas com campos e hint contextual
- [x] Reorganizar `play`, `queue`, `nowplaying`, `config view` e `doctor` para leitura rapida em blocos
- [x] Enriquecer favoritos e playlists com origem do atalho, contexto da playlist e proximo passo real
- [x] Fortalecer `config`, `doctor` e `help` com leitura mais clara da guild e feedback administrativo mais guiado
- [x] Dar titulos melhores para validacoes de prefixo, volume e recover quando o dominio bloquear a acao
- [x] Refinar `loop`, `history`, biblioteca e help com mais orientacao acionavel sem mudar a arquitetura nem o handler interativo
- [x] Melhorar a resposta de erro controlado quando a faixa e encontrada, mas o stream nao abre
- [x] Corrigir a classificacao do erro quando a sessao salva existe, mas o recovery nao consegue mais reaproveitar faixas tocaveis
- [x] Corrigir a leitura tecnica do erro de stream para preservar rota real quando conhecida e evitar `desconhecida/desconhecido` quando o runtime nao tiver esse contexto
- [x] Preservar a rota da tentativa tambem nos erros de `playerError/error` que chegam pelo watcher antes do primeiro audio
- [x] Priorizar a rota observada do extractor no erro controlado quando o fallback interno divergir da rota originalmente solicitada
- [x] Bloquear stream do `SoundCloudExtractor` e remove-lo do bundle padrao para evitar fallback incoerente com a superficie publica do produto
- [x] Corrigir a inferencia de rota/pipeline do YouTube para usar a configuracao real da instancia em vez de fallback global `youtube-dl`
- [x] Limpar fila residual vazia quando o stream falhar antes do primeiro audio
- [x] Parar de tratar fila fantasma como `active/healthy` em `doctor` e `session health`
- [x] Sugerir `compatibility` como contraprova quando o bloqueio real vier de `YouTube/youtubei`
- [x] Degradar o runtime de `fidelity/youtubei` para `compatibility/youtube-dl` com retry unico quando a abertura real do stream falhar
- [x] Endurecer a suite com assertions obrigatorias e mais cobertura direta para comandos/utilitarios e fluxos administrativos/sessao
- [x] Explicar melhor no resultado do `play` quando o PHONIX precisou preparar conexao, reaproveitou a sessao ou confirmou start real antes da resposta
- [x] Reforcar `nowplaying`, `queue` e o resultado do `play` com artwork/capa, link da faixa e leitura visual mais forte quando houver metadata disponivel
- [x] Tornar a resposta de slash segura quando a interaction ja expirou ou nao pode mais ser editada
- [x] Tornar o descarte de queue idempotente em cleanup de playback, replace, reset de recovery e timeout de fila
- [x] Reduzir warning duplicado quando o recovery automatico ja falhou da forma esperada e a telemetria ja foi gravada
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER`, `CHANGELOG` e docs operacionais impactadas
- [x] Alinhar runtime e versao publica para `2.1.0`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm run test`
- [x] Rodar `npm run test:smoke`
- [ ] Validar o fluxo de Smart Session em Discord real apos restart controlado
- [ ] Validar manualmente recover parcial e leitura visual final de `queue`/`nowplaying` em ambiente real

### `v2.0.5` - Owner Control, Online DM & Official Guild Operations

- [x] Reanalisar docs, bootstrap, auth, diagnostics, commands e runtime antes de introduzir owner access
- [x] Centralizar o reconhecimento do owner por Discord User ID em uma policy unica
- [x] Registrar a guild oficial como referencia operacional fixa da release
- [x] Adicionar DM automatica ao owner no `ClientReady`
- [x] Evitar duplicacao de DM automatica por ciclo de processo
- [x] Entregar resumo operacional util e auditavel na DM de online
- [x] Criar namespace `/owner` com `status`, `incidents`, `guilds`, `official-guild` e `notify-test`
- [x] Restringir a superficie owner apenas ao owner oficial
- [x] Manter `/owner` com visibilidade administrativa no catalogo slash e `!owner` como caminho garantido do owner global
- [x] Permitir bypass administrativo controlado do owner no fluxo de prefixo para `config` e `doctor`
- [x] Destacar a guild oficial nas leituras do owner
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER`, `CHANGELOG` e `docs/operations/owner-control.md`
- [x] Alinhar runtime e versao publica para `2.0.5`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm run test`
- [x] Rodar `npm run test:smoke`
- [ ] Validar entrega real da DM ao owner em ambiente Discord
- [ ] Validar o namespace `/owner` manualmente em uma guild real
- [ ] Confirmar visual final dos embeds do owner no Discord real

### `v2.0.4` - Structural Cleanup & Technical Sanity

- [x] Reanalisar docs, estrutura real e responsabilidades de cada pasta antes de mover qualquer arquivo
- [x] Confirmar utilitarios mortos ou mal posicionados em `src/modules/commands`
- [x] Remover `commands/helpers.ts` e `commands/guards.ts` por falta de uso real
- [x] Consolidar mapeamento de favoritos/playlists para `StoredTrack` em `src/modules/library/trackMapping.ts`
- [x] Tirar helpers de verificacao de dentro de modulos de runtime e move-los para `src/scripts/support`
- [x] Consolidar a execucao da suite de verificacao em helper compartilhado de script
- [x] Criar harness unico para testes SQLite/Prisma em `tests/support/sqliteTestHarness.ts`
- [x] Reduzir duplicacao e fragilidade dos testes de banco
- [x] Limpar o tratamento de artefatos temporarios locais no projeto
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER` e `CHANGELOG`
- [x] Alinhar runtime e versao publica para `2.0.4`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm run test`
- [x] Rodar `npm run test:smoke`

### `v2.0.3` - Command UX & Discord Presentation

- [x] Reanalisar docs, comandos, presenters, view models, embeds e use cases reais antes de mexer
- [x] Mapear gargalos concretos de UX em playback, biblioteca, config, doctor e help
- [x] Melhorar descricoes dos comandos e subcomandos publicos
- [x] Revisar respostas de sucesso, erro e orientacao do playback
- [x] Reforcar favoritos, playlists e historico com respostas mais estruturadas
- [x] Elevar `queue` e `nowplaying` com mais contexto de sessao no embed
- [x] Reorganizar visual de `help`, `config view` e `doctor`
- [x] Ajustar `theme`, `view-models`, `presenters` e `embeds` para sustentar a nova camada visual
- [x] Atualizar `README`, `ARCHITECTURE`, `PROJECT_TRACKER` e `CHANGELOG`
- [x] Alinhar runtime e versao publica para `2.0.3`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`
- [ ] Validar visual final em Discord real depois do deploy desta revisao
- [ ] Rodar uma passagem manual completa dos comandos principais em guild real

### `v2.0.2` - Admin Center Auth Hardening

- [x] Reanalisar o fluxo real do dashboard, OAuth e sessao web no codigo
- [x] Confirmar que a autorizacao era baseada apenas em snapshot do login
- [x] Expandir `DashboardSession` com material OAuth e timestamp de sync
- [x] Cifrar tokens OAuth em repouso no SQLite
- [x] Adicionar refresh de token no cliente OAuth do Discord
- [x] Revalidar guild filtering ao longo da sessao
- [x] Forcar refresh/revalidacao antes de mutacoes do painel
- [x] Invalidar a sessao quando o refresh OAuth falhar
- [x] Podar sessoes expiradas do painel no startup
- [x] Adicionar cobertura automatizada para revalidacao, revogacao de acesso e falha de refresh
- [x] Adicionar `npm run verify:dashboard`
- [x] Criar runbook `docs/verification/admin-center-verification.md`
- [x] Alinhar runtime, docs e versao publica para `2.0.2`
- [x] Rodar `npm run prisma:generate`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`
- [ ] Validar OAuth manualmente contra Discord real
- [ ] Validar revogacao de admin/bot removido em ambiente real
- [ ] Validar visual final do painel em navegador real

### `v2.0.1` - Release Stability Fixes

- [x] Reproduzir a falha real de `npm run verify:playback`
- [x] Confirmar que os erros eram timeouts falsos em testes de Prisma + SQLite no Windows
- [x] Reduzir custo repetido da leitura de migrations no bootstrap SQLite
- [x] Endurecer timeouts explicitos dos testes pesados de bootstrap/integracao
- [x] Alinhar runtime, testes e docs para `2.0.1`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

### `v2.0.0` - Admin Center & Release Consolidation

- [x] Alinhar a versao publica do projeto para `2.0.0`
- [x] Expor a versao atual no runtime, no `doctor` e no dashboard
- [x] Adicionar modulo `dashboard` no codigo real
- [x] Embutir servidor HTTP no mesmo runtime do bot
- [x] Usar `Fastify` server-rendered, sem SPA separada
- [x] Adicionar login via Discord OAuth2
- [x] Restringir acesso a admins das guilds em que o bot estiver instalado
- [x] Persistir sessoes web em SQLite com `DashboardSession`
- [x] Usar cookie HTTP-only assinado e token CSRF nas mutacoes
- [x] Implementar `Overview`, `Config`, `Diagnostics` e `Operations`
- [x] Expor rotas HTML e API do Admin Center
- [x] Reaproveitar `doctor`, `GuildSettingsService`, `PlaybackSessionsService`, `PlaybackSessionManager`, `OperationalTelemetryService` e `MusicService`
- [x] Manter o dashboard opt-in por env, sem quebrar o bot quando a config web estiver ausente
- [x] Adicionar testes para env parsing, callback OAuth, sessao expirada, logout, CSRF, overview, diagnostics, config web, `recover` e `stop`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm run test`
- [x] Rodar `npm run test:smoke`
- [ ] Validar OAuth manualmente contra Discord real
- [ ] Validar uma guild admin real dentro do dashboard
- [ ] Validar visual final do dashboard em ambiente real
- [ ] Validar dashboard desabilitado por env em ambiente manual
- [ ] Preencher release manual da `v2.0.0` apos rodada real

### `v1.0.0` - Foundation

- [x] Projeto base em TypeScript + Node.js
- [x] Integracao com `discord.js` 14
- [x] Integracao com `discord-player`
- [x] YouTube + links Spotify
- [x] Slash commands + prefixo `!`
- [x] Prisma + SQLite
- [x] Assets visuais iniciais
- [x] Testes unitarios e de integracao iniciais

### `v1.1.0` - Architecture Refresh

- [x] Reorganizacao de pastas em `app`, `core` e `modules`
- [x] Bootstrap separado da composicao da aplicacao
- [x] Client Discord extraido para camada `core`
- [x] Container de servicos centralizado
- [x] Documentacao de arquitetura adicionada
- [x] Tracker versionado com checklist

### `v1.2.0` - Guild Configuration

- [x] Adicionar comando `/config`
- [x] Adicionar suporte a `!config`
- [x] Proteger configuracoes com permissao de administrador
- [x] Persistir `prefix`, `defaultVolume` e `autoplayEnabled`
- [x] Aplicar volume novo na fila atual quando existir sessao ativa
- [x] Atualizar help embed com area administrativa
- [x] Limpar saidas textuais para ASCII consistente
- [x] Expandir testes unitarios e de integracao
- [x] Atualizar docs, tracker e changelog

### `v1.3.0` - Runtime Diagnostics

- [x] Criar modulo de diagnostico para FFmpeg, Discord e banco
- [x] Adicionar comando `/doctor`
- [x] Adicionar suporte a `!doctor`
- [x] Validar gateway intents essenciais e opcionais
- [x] Validar publicacao de slash commands no escopo configurado
- [x] Validar permissoes do bot no canal atual e no canal de voz
- [x] Exibir relatorio padronizado com `OK`, `Avisos` e `Erros`
- [x] Expandir testes unitarios do diagnostico
- [x] Atualizar docs, tracker e changelog

### `v1.4.0` - Runtime Hardening

- [x] Corrigir bootstrap de producao para `npm run start`
- [x] Separar `tsconfig.build.json` para empacotar apenas `src`
- [x] Corrigir inicializacao do SQLite com migrations automaticas
- [x] Reduzir ruido de erros esperados no pipeline de comandos
- [x] Desativar DAVE encryption no node de voz para compatibilidade com Windows App Control
- [x] Validar `build`, `test`, `deploy:commands` e `start` em smoke checks reais
- [x] Expandir testes do runtime critico e do `MusicService`

### `v1.4.1` - Voice Connection Fix

- [x] Pesquisar o fluxo real de conexao de voz no `discord-player`
- [x] Mover a compatibilidade sem DAVE de `nodeOptions` para `connectionOptions`
- [x] Corrigir `join` para conectar com `daveEncryption: false`
- [x] Corrigir `play` para inicializar conexao com `daveEncryption: false`
- [x] Manter configuracao de fila separada das opcoes de conexao de voz
- [x] Expandir testes de `MusicService` para `play`, `join` e `ensureQueue`
- [x] Revalidar `build` e `test`

### `v1.4.2` - YouTube Stream Fallback

- [x] Reproduzir localmente o erro `Could not extract stream for this track`
- [x] Confirmar falha do backend `youtubei` puro em stream extraction
- [x] Validar fallback com `useYoutubeDL: true`
- [x] Centralizar a configuracao do extractor do YouTube
- [x] Manter logs proprios do PHONIX e silenciar ruido interno do extractor
- [x] Expandir testes de configuracao do extractor
- [x] Revalidar `build`, `test` e extracao real de stream

### `v1.4.3` - FFmpeg Runtime Alignment

- [x] Reproduzir a divergencia entre `checkFfmpeg` e o runtime do `discord-player`
- [x] Confirmar que o `ffmpegPath` do `Player` nao bastava para a resolucao interna do `@discord-player/ffmpeg`
- [x] Registrar o executavel configurado como source preferencial do runtime de FFmpeg
- [x] Forcar re-resolucao do FFmpeg antes do bootstrap do player
- [x] Adicionar testes unitarios para ordem e deduplicacao das sources
- [x] Revalidar `build`, `test`, `resolve()` e `createFFmpegStream()`

### `v1.6.0` - Command Engine Hardening

- [x] Centralizar execucao dos comandos em uma pipeline unica
- [x] Introduzir hierarquia de erros tipados para comando
- [x] Centralizar precondicoes de voz, fila, FFmpeg e administracao
- [x] Garantir resposta unica por execucao de comando
- [x] Padronizar telemetria de comando com status, duracao e origem
- [x] Migrar comandos principais para retornar payloads em vez de responder diretamente
- [x] Detectar colisao de nomes e aliases no registry
- [x] Adicionar testes unitarios para executor e precondicoes
- [x] Adicionar CI para build + test em Windows e Linux

### `v1.6.1` - Playback Stability Pass

- [x] Aumentar timeout de conexao de voz para reduzir aborts prematuros
- [x] Confirmar inicio real do playback antes de responder sucesso em `play`
- [x] Normalizar URLs do YouTube com parametros de playlist/mix antes da busca
- [x] Silenciar warnings ruidosos do parser `youtubei.js` sem esconder erros reais
- [x] Rebaixar erros controlados de comandos para `debug` e manter dependencias em `warn`
- [x] Tratar `AbortError` de voz como falha amigavel e limpar fila quebrada
- [x] Expandir testes unitarios de `MusicService`, executor e eventos do player
- [x] Revalidar `build`, `test`, smoke start e busca real com URL do YouTube

### `v1.7.0` - Queue Persistence & Recovery

- [x] Persistir sessao de playback por guild em SQLite
- [x] Adicionar `resumeQueueEnabled` em `GuildSettings`
- [x] Adicionar modelos `GuildPlaybackSession` e `GuildPlaybackSessionItem`
- [x] Reutilizar `StoredTrack` serializado em JSON nas sessoes
- [x] Criar `PlaybackSessionsService`
- [x] Criar `PlaybackSessionManager` com sync debounce e recovery hibrido
- [x] Auto-recuperar apos restart quando ainda houver humanos no canal salvo
- [x] Manter sessao pendente quando o canal salvo estiver vazio
- [x] Adicionar `/recover`, `!recover` e `!retomar`
- [x] Adicionar `config resumequeue`
- [x] Atualizar `help`, `settings` e `doctor` com status de recovery
- [x] Migrar bootstrap SQLite para aplicar migrations pendentes em upgrades
- [x] Expandir testes unitarios, de integracao e smoke start

### `v1.8.0` - Operacao profunda

- [x] Adicionar telemetria operacional por guild
- [x] Classificar falhas de playback/voz por etapa, provider e pipeline
- [x] Integrar falhas de comando na telemetria operacional
- [x] Reforcar `register-client-events` com sinais reais de voz/player
- [x] Adicionar retry automatico limitado e criterio de abort no recovery
- [x] Evitar loop infinito de recovery por guild
- [x] Preservar sessao quando fizer sentido e limpar sessao zumbi quando a falha for terminal
- [x] Fortalecer `doctor` com estado do player, pipeline e resumo operacional por guild
- [x] Criar testes de telemetria operacional
- [x] Criar smoke tests de eventos de voz/player
- [x] Adicionar script dedicado `npm run test:smoke`
- [x] Revalidar `build`, `test` e `test:smoke`

### `v1.8.1` - Telemetria persistida

- [x] Persistir incidentes operacionais fora da memoria do processo
- [x] Adicionar migration versionada para `OperationalIncident`
- [x] Fortalecer `doctor` com historico persistido apos restart
- [x] Registrar warnings upstream conhecidos para diagnostico
- [x] Suprimir `DEP0040` no runtime do app por handler controlado
- [x] Adicionar `flushPersistence()` no shutdown
- [x] Adicionar testes de persistencia operacional
- [x] Adicionar teste do handler de warnings
- [x] Revalidar `prisma:generate`, `build`, `test`, `test:smoke` e smoke start

### `v1.9.0` - Domain Use Cases & Command Decoupling

- [x] Criar camada de use cases por dominio em `music`, `library` e `diagnostics`
- [x] Introduzir DTOs internos para respostas de playback, biblioteca, config, doctor e help
- [x] Transformar comandos em adaptadores finos com presenters reutilizaveis
- [x] Evoluir o container para expor `useCases` alem dos services base
- [x] Preservar o catalogo publico de comandos slash e prefixo
- [x] Reforcar testes de adaptacao dos comandos para o novo wiring
- [x] Adicionar testes unitarios dos use cases de playback, biblioteca e admin
- [x] Adicionar `npm run typecheck`
- [x] Incluir `typecheck` como gate oficial do CI
- [x] Atualizar docs, tracker e changelog para a nova arquitetura

### `v1.9.1` - Interactive Help Command

- [x] Expandir `HelpResultView` para um DTO real de ajuda
- [x] Adicionar paginas `Inicio`, `Playback`, `Biblioteca`, `Recovery` e `Admin`
- [x] Manter `/help` e `!help` como entrada unica
- [x] Adicionar navegacao por select menu e botoes
- [x] Restringir interacoes ao usuario que abriu o painel
- [x] Adicionar handler dedicado de componentes do help
- [x] Integrar componentes ao `InteractionCreate`
- [x] Atualizar presenter e embed do `help`
- [x] Adicionar testes do use case de help
- [x] Adicionar testes de presenter/componentes
- [x] Adicionar testes do handler de navegacao
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`

### `v1.9.2` - Smart `play` / `tocar`

- [x] Adicionar `mode` opcional ao slash command `play`
- [x] Adicionar `source` opcional ao slash command `play`
- [x] Adicionar flags `--next`, `--replace`, `--youtube` e `--spotify` ao prefixo
- [x] Manter `!play query` e `!tocar query` como fluxo padrao
- [x] Centralizar a nova orquestracao no use case de playback
- [x] Evoluir `MusicService.play` para `queue`, `next` e `replace`
- [x] Pesquisar antes de substituir a fila atual
- [x] Melhorar a resposta visual do `play` com status, origem, posicao e ETA
- [x] Canonicalizar share links do Spotify
- [x] Atualizar `help` e README com os novos modos
- [x] Adicionar testes unitarios para parse do comando
- [x] Adicionar testes unitarios para o use case de playback
- [x] Adicionar testes unitarios para o `MusicService`

### `v1.9.6` - Playback Pipeline Diagnostics

- [x] Corrigir o diagnostico do pipeline para refletir o runtime real do PHONIX
- [x] Expor bitrate do canal alvo no `doctor`
- [x] Expor client do YouTube, pipeline real e route bridge/nativa no `doctor`
- [x] Registrar `provider` e `pipeline` tambem nos sinais de playback
- [x] Distinguir `youtube-dl`, `youtubei` nativo e `spotify-bridge` nos eventos observaveis
- [x] Atualizar README, arquitetura, tracker e changelog para a leitura nova do pipeline
- [x] Revalidar `typecheck`, `build`, `test` e `test:smoke`

### `v1.9.7` - Controlled Playback Profiles

- [x] Criar perfis `compatibility` e `fidelity` para o pipeline do YouTube
- [x] Manter `compatibility` como padrao seguro
- [x] Exigir base minima para `fidelity`, com downgrade automatico para `compatibility` quando faltar `YOUTUBE_COOKIE`
- [x] Tornar configuraveis `YOUTUBE_STREAM_CLIENT`, `YOUTUBE_COOKIE` e `YOUTUBE_HIGH_WATER_MARK`
- [x] Diferenciar no codigo e na documentacao estabilidade de stream versus fidelidade
- [x] Levar requested/effective profile e highWaterMark para o `doctor`
- [x] Atualizar `.env.example`, README, arquitetura, tracker e changelog
- [x] Revalidar `typecheck`, `build`, `test` e `test:smoke`
- [x] Rodar `npm run typecheck`

### `v1.9.8` - Source Clarity

- [x] Tornar explicito no `play` quando Spotify entra por bridge
- [x] Tornar explicito no `help` que Spotify hoje nao toca do source original
- [x] Tornar explicito no `doctor` que Spotify entra por `spotify-bridge`
- [x] Atualizar README, arquitetura, tracker e changelog com essa leitura
- [x] Registrar `source:soundcloud` apenas como possibilidade futura ainda nao implementada
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

### `v1.9.9` - Playback Verification

- [x] Formalizar matriz A/B para `64/128/256/384 kbps`
- [x] Comparar `compatibility` vs `fidelity` em um runbook reutilizavel
- [x] Adicionar script oficial `npm run verify:playback`
- [x] Encadear `typecheck`, `build`, `test` e `test:smoke` nessa verificacao
- [x] Documentar o procedimento manual no Discord com criterios de leitura e planilha sugerida
- [x] Atualizar README, arquitetura, tracker e changelog
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`
- [x] Validar ambiente local com `fidelity` efetivo, `youtubei` ativo e cookie configurado
- [x] Registrar o estado atual do ambiente em `docs/verification/playback-verification-results.md`
- [ ] Executar comparacao manual no Discord em `64/128/256/384 kbps`
- [ ] Registrar tempos, stutters, falhas, recoveries e observacao auditiva na matriz final

### `v1.9.4` - Command System Review

- [x] Revisar documentacao central do projeto antes das mudancas
- [x] Mapear a pipeline real de comandos ponta a ponta
- [x] Introduzir guias compartilhados para exemplos e mensagens de uso
- [x] Corrigir a divergencia de permissao admin entre slash e prefixo em `config`
- [x] Padronizar parse errors guiados em comandos centrais
- [x] Melhorar feedback de `queue`, `nowplaying`, `volume`, `loop`, `autoplay` e `recover`
- [x] Melhorar `favorite`, `playlist` e `history` com respostas mais claras
- [x] Fazer `favorite play` e `playlist play` reutilizarem o preflight completo de voz
- [x] Melhorar `doctor` com proximos passos acionaveis
- [x] Melhorar `config view` com atalhos rapidos
- [x] Atualizar help e docs para refletir o estado real do sistema de comandos
- [x] Adicionar testes focados em permissao admin, feedback guiado e previsibilidade de UX
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

### `v1.9.5` - Command Catalog Cleanup

- [x] Auditar o catalogo real de slash, prefixos, aliases e help
- [x] Confirmar redundancia funcional entre `leave` e `stop`
- [x] Confirmar baixo valor de `join` diante do auto-connect de `play` e `recover`
- [x] Remover o comando standalone `autoplay` e consolidar o ajuste persistido em `config autoplay`
- [x] Remover `join` e `leave` do catalogo publico de slash commands
- [x] Preservar transicao de prefixo movendo `leave`, `sair` e `disconnect` para aliases de `stop`
- [x] Remover aliases fracos ou confusos (`next` em `skip`, `pl`, `cfg`, `health`)
- [x] Atualizar help, README, arquitetura, tracker e changelog para a nova estrutura final
- [x] Ajustar testes estruturais e de UX critica para o catalogo reduzido
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

## Checklist Atual

### Core

- [x] Config carregada por `zod`
- [x] Prisma client centralizado
- [x] Logger centralizado
- [x] Bootstrap com shutdown controlado
- [x] Policy central de owner access e guild oficial

### Discord e Commands

- [x] Registro de slash commands
- [x] Parser de prefixo
- [x] Registry unico de comandos
- [x] Catalogo publico limpo, sem comandos redundantes de sessao
- [x] Contexto compartilhado de execucao
- [x] Executor central de comandos
- [x] Erros tipados por categoria
- [x] Precondicoes centralizadas
- [x] Telemetria estruturada por comando
- [x] Comandos finos orientados a use cases
- [x] Presenters dedicados para mapear DTOs de dominio em embeds/respostas
- [x] Help interativo com componentes e navegacao stateless
- [x] Comando administrativo de configuracao por guild
- [x] Comando administrativo de diagnostico por guild
- [x] Restricao por permissao de administrador
- [x] Namespace `/owner` com protecao explicita por Discord User ID
- [x] Bypass administrativo controlado do owner no prefixo
- [x] Guias compartilhados para exemplos, help e mensagens de uso
- [x] Coerencia admin entre slash e prefixo
- [x] Embeds administrativos com proximo passo contextual
- [x] `queue` e `nowplaying` com painel de sessao mais completo
- [x] Biblioteca e historico com respostas mais estruturadas
- [x] Camada visual dos comandos revisada para `v2.0.3`
- [x] Helpers de verificacao e suporte de teste reorganizados para `v2.0.4`

### Dashboard

- [x] Servidor Fastify embutido no mesmo runtime
- [x] Login Discord OAuth
- [x] Guild filtering por bot instalado + admin permission
- [x] Sessao web persistida em SQLite
- [x] Cookie HTTP-only assinado
- [x] Protecao CSRF em mutacoes
- [x] Overview operacional por guild
- [x] Config web refletindo os mesmos services do Discord
- [x] Diagnostics web reutilizando `doctor`
- [x] Operations web com `recover` e `stop`
- [x] Dashboard opt-in por env
- [x] Tokens OAuth cifrados em repouso
- [x] Revalidacao automatica de guild filtering durante a sessao
- [x] Refresh obrigatorio antes de mutacoes administrativas
- [x] Invalida sessao quando o OAuth falha
- [x] Prune de sessoes expiradas no startup
- [ ] Validacao manual do fluxo OAuth
- [ ] Validacao manual visual do painel

### Music

- [x] FFmpeg check no startup
- [x] Extractors oficiais carregados
- [x] `YoutubeiExtractor` configurado
- [x] Spotify protegido por credenciais
- [x] Aplicacao imediata do volume padrao em fila ativa
- [x] Diagnostico do runtime de audio via `/doctor`
- [x] Compatibilidade de voz sem DAVE para hosts Windows bloqueados
- [x] Compatibilidade de voz aplicada no ponto efetivo de conexao do `discord-player`
- [x] Playback do YouTube endurecido com fallback de stream via `youtube-dl`
- [x] Runtime de FFmpeg do `discord-player` alinhado ao executavel configurado no `.env`
- [x] Timeout de voz unificado entre `Player`, `queue.connect` e node options
- [x] Confirmacao de `PlayerStart` antes de sucesso em `play`
- [x] Normalizacao de URL do YouTube para reduzir falhas com links de mix/playlist em `watch`
- [x] Persistencia da faixa atual e das proximas faixas entre restarts
- [x] Auto-recuperacao hibrida de fila por guild
- [x] Recuperacao manual de sessao com `recover`
- [x] Telemetria operacional por guild com falhas, recoveries e sinais recentes
- [x] DM automatica de online para o owner com resumo operacional do runtime
- [x] Leitura dedicada da guild oficial para operacao do owner
- [x] Recovery automatico com retry limitado e criterio de abort
- [x] Diagnostico de player state, pipeline e sinais operacionais via `/doctor`
- [x] Historico operacional persistido em SQLite
- [x] Warnings upstream conhecidos capturados para diagnostico
- [x] Recovery acionavel tambem pela superficie web via os mesmos use cases/servicos

### Data

- [x] Favoritos persistidos
- [x] Playlists persistidas
- [x] Historico persistido
- [x] Guild settings persistidas
- [x] Prefixo por servidor persistido
- [x] Volume padrao por servidor persistido
- [x] Autoplay padrao por servidor persistido
- [x] Resume queue por servidor persistido
- [x] Sessao de playback persistida por guild
- [x] Sessao web administrativa persistida por usuario

### Quality

- [x] Build passando
- [x] Typecheck passando
- [x] Testes passando
- [x] CI para build + test
- [x] CI para typecheck + build + test
- [x] Migration SQL versionada
- [x] Docs de arquitetura criadas
- [x] Changelog de versoes criado
- [x] Checklist operacional atualizado
- [x] Start compilado validado por smoke test
- [x] Upgrade incremental de migrations SQLite validado
- [x] Smoke tests dedicados de voz/player
- [x] Diagnostico operacional por guild validado em teste
- [x] Historico operacional validado em banco real
- [x] Warning handler validado em teste unitario
- [x] Suite reforcada para UX e robustez do sistema de comandos
- [x] Script `npm run verify:playback` validado localmente
- [x] Ambiente local apto a comparar `compatibility` vs `fidelity` sem downgrade
- [x] Suite reforcada para o Admin Center e a release `2.0.0`
- [x] Script `npm run verify:dashboard` para a release do painel
- [x] Suite reforcada para embeds, queue/nowplaying e UX da `v2.0.3`
- [ ] Matriz manual de playback preenchida no Discord real
- [ ] Fluxo OAuth validado manualmente em Discord real

## Checklist de `v1.2.0`

- [x] Verificar servico atual de `GuildSettings`
- [x] Planejar escopo do comando de configuracao
- [x] Implementar `/config view`
- [x] Implementar `/config prefix`
- [x] Implementar `/config volume`
- [x] Implementar `/config autoplay`
- [x] Registrar o comando no registry unico
- [x] Atualizar help embed
- [x] Adicionar cobertura de testes
- [x] Atualizar documentacao da release

## Checklist de `v1.3.0`

- [x] Verificar checks existentes de FFmpeg e ambiente
- [x] Analisar cliente Discord, intents e deploy de slash commands
- [x] Planejar escopo do modulo de diagnostico
- [x] Criar service de diagnostico desacoplado do comando
- [x] Implementar `/doctor`
- [x] Implementar `!doctor`
- [x] Validar banco SQLite no runtime
- [x] Validar status do FFmpeg
- [x] Validar intents do cliente
- [x] Validar deploy de slash commands
- [x] Validar permissoes de texto do bot
- [x] Validar permissoes de voz do bot
- [x] Atualizar help embed e resposta visual do diagnostico
- [x] Adicionar testes unitarios do doctor service
- [x] Atualizar documentacao da release

## Checklist de `v1.4.0`

- [x] Reproduzir falha de `npm run start`
- [x] Identificar saida incorreta do build compilado
- [x] Criar `tsconfig.build.json`
- [x] Revalidar script `start`
- [x] Reproduzir falha de voz no `discord-voip`
- [x] Identificar bloqueio do binding nativo por politica do Windows
- [x] Desativar DAVE no node de voz
- [x] Cobrir `MusicService` com testes especificos
- [x] Reforcar bootstrap do SQLite
- [x] Rodar smoke check real de producao

## Checklist de `v1.4.1`

- [x] Inspecionar implementacao local do `discord-player`
- [x] Confirmar que `daveEncryption` so e respeitado em `connectionOptions`
- [x] Ajustar `MusicService.join`
- [x] Ajustar `MusicService.play`
- [x] Separar builder de node options e connection options
- [x] Adicionar teste de `join` com `queue.connect`
- [x] Adicionar teste de `play` com `connectionOptions`
- [x] Adicionar teste de `ensureQueue` sem flags indevidas de conexao
- [x] Rodar `npm run build`
- [x] Rodar `npm test`

## Checklist de `v1.4.2`

- [x] Pesquisar a regressao de stream do YouTube
- [x] Reproduzir a falha com uma URL real fora do fluxo do bot
- [x] Comparar `youtubei` puro versus `youtube-dl` fallback
- [x] Atualizar `MusicService.setupExtractors`
- [x] Extrair builder de opcoes do extractor do YouTube
- [x] Cobrir setup do extractor com testes unitarios
- [x] Cobrir registro condicional do Spotify com testes unitarios
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Validar extracao real de stream com video conhecido

## Checklist de `v1.4.3`

- [x] Inspecionar a implementacao local de `@discord-player/ffmpeg`
- [x] Reproduzir a falha de resolucao apesar do health check positivo
- [x] Criar helper para registrar source preferencial de FFmpeg
- [x] Integrar a configuracao no bootstrap da aplicacao
- [x] Adicionar testes para prepend e deduplicacao
- [x] Adicionar teste para `resolve(true)` forcado
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Validar `FFmpeg.resolve(true)` com o caminho do `.env`
- [x] Validar `createFFmpegStream()` sem erro de localizacao

## Checklist de `v1.6.0`

- [x] Criar erros tipados para validacao, autorizacao, precondicao, dependencia, conflito e infraestrutura
- [x] Criar executor central com defer, reply e logging unificados
- [x] Centralizar precondicoes de FFmpeg, admin, voz e fila
- [x] Remover replies diretas dos comandos principais
- [x] Migrar comandos para retornar payloads
- [x] Endurecer o registry contra chaves duplicadas
- [x] Adicionar testes do executor de comando
- [x] Adicionar testes de precondicoes
- [x] Adicionar workflow CI
- [x] Rodar `npm run build`
- [x] Rodar `npm test`

## Checklist de `v1.6.1`

- [x] Reproduzir o falso sucesso apos `AbortError` no runtime de voz
- [x] Inspecionar o `discord-player` local para confirmar que `playStream()` emite erro sem lançar excecao
- [x] Aumentar timeout de conexao de voz no bootstrap e nas opcoes de fila/conexao
- [x] Adicionar watcher de `PlayerStart`, `Error` e `PlayerError` no `MusicService.play`
- [x] Mapear timeout de voz para mensagem amigavel ao usuario
- [x] Canonicalizar links do YouTube `watch`, `youtu.be`, `shorts`, `live` e `embed`
- [x] Rebaixar logs de validacao/precondicao para `debug`
- [x] Tratar `AbortError` de fila como `warn` com limpeza de fila ociosa
- [x] Adicionar testes de runtime para `registerClientEvents`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Validar busca real com URL do YouTube normalizada
- [x] Rodar smoke start com login e shutdown controlado

## Checklist de `v1.7.0`

- [x] Expandir schema Prisma com sessao persistida por guild
- [x] Criar migration versionada para `resumeQueueEnabled` e tabelas de sessao
- [x] Endurecer bootstrap SQLite para aplicar migrations pendentes em banco existente
- [x] Criar `PlaybackSessionsService`
- [x] Criar `PlaybackSessionManager`
- [x] Sincronizar snapshots da fila com debounce por eventos do player
- [x] Limpar sessao salva em `stop`, `leave`, fim da fila e desativacao de `resumequeue`
- [x] Implementar auto-recovery hibrido no startup
- [x] Implementar recovery manual com `/recover`, `!recover` e `!retomar`
- [x] Adicionar `config resumequeue`
- [x] Atualizar `help`, `settings` e `doctor`
- [x] Adicionar testes de service, manager, commands, SQLite upgrade e integracao
- [x] Rodar `npm run prisma:generate`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar smoke start do app compilado

## Checklist de `v1.8.0`

- [x] Ler docs e mapear o estado atual do projeto
- [x] Confirmar gaps reais em recovery, telemetria e doctor no codigo
- [x] Criar `OperationalTelemetryService`
- [x] Criar classificacao de falhas em `playbackFaults.ts`
- [x] Restaurar e endurecer `PlaybackSessionManager`
- [x] Adicionar retry automatico limitado por guild
- [x] Adicionar criterio de abort para recovery
- [x] Evitar limpeza indevida de sessao durante recovery
- [x] Integrar telemetria ao executor de comandos
- [x] Integrar telemetria e recovery aos eventos do player/voz
- [x] Fortalecer `doctor` com player state e resumo operacional
- [x] Adicionar testes unitarios de telemetria operacional
- [x] Adicionar testes de retry/abort de recovery
- [x] Adicionar smoke tests de eventos de voz/player
- [x] Adicionar script `npm run test:smoke`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

## Checklist de `v1.8.1`

- [x] Projetar persistencia historica da telemetria operacional
- [x] Expandir schema Prisma com `OperationalIncident`
- [x] Criar migration SQL para incidentes operacionais
- [x] Criar `OperationalTelemetryStoreService`
- [x] Persistir eventos de comando, playback, falha, recovery e warnings
- [x] Adicionar flush de persistencia no shutdown
- [x] Fazer `doctor` ler historico persistido por guild
- [x] Fazer `doctor` ler warnings runtime persistidos
- [x] Adicionar handler de warnings conhecidos no processo
- [x] Adicionar teste de integracao da persistencia operacional
- [x] Adicionar teste unitario do handler de warnings
- [x] Rodar `npm run prisma:generate`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`
- [x] Rodar smoke start do app compilado

## Checklist de `v1.9.0`

- [x] Ler o estado atual da arquitetura e dos comandos reais
- [x] Mapear regras candidatas para extracao em use cases
- [x] Criar DTOs de view para playback, biblioteca, config, help e doctor
- [x] Criar `playbackUseCases`
- [x] Criar `libraryUseCases`
- [x] Criar `adminUseCases`
- [x] Expor `useCases` no container da aplicacao
- [x] Adaptar comandos de playback para o novo wiring
- [x] Adaptar comandos de biblioteca para o novo wiring
- [x] Adaptar comandos admin/utilitarios para o novo wiring
- [x] Adicionar presenters para embeds e replies
- [x] Atualizar testes de comandos para depender de use cases
- [x] Adicionar testes unitarios dos use cases
- [x] Adicionar script `npm run typecheck`
- [x] Atualizar CI para rodar `typecheck`
- [x] Rodar `npm run typecheck`
- [x] Rodar `npm run build`
- [x] Rodar `npm test`
- [x] Rodar `npm run test:smoke`

## Checklist de release manual

- [ ] Preencher `.env`
- [ ] Instalar/configurar FFmpeg
- [ ] Rodar `npm run prisma:generate`
- [ ] Aplicar banco local
- [ ] Rodar `npm run build`
- [ ] Rodar `npm test`
- [ ] Rodar `npm run verify:dashboard`
- [ ] Publicar slash commands
- [ ] Se for usar o Admin Center, configurar `DISCORD_CLIENT_SECRET`, `DASHBOARD_ENABLED`, `DASHBOARD_BASE_URL`, `DASHBOARD_PORT` e `DASHBOARD_SESSION_SECRET`
- [ ] Validar `/config view`
- [ ] Validar `/config prefix`
- [ ] Validar `/config volume`
- [ ] Validar `/config autoplay`
- [ ] Validar `/config resumequeue`
- [ ] Validar `/doctor`
- [ ] Validar `!doctor`
- [ ] Validar `/recover`
- [ ] Validar `!retomar`
- [ ] Validar playback real em canal de voz
- [ ] Rodar `/doctor` em `compatibility` e confirmar perfil/pipeline/bitrate
- [ ] Rodar `/doctor` em `fidelity` e confirmar perfil/pipeline/bitrate
- [ ] Preencher a matriz A/B em `docs/verification/playback-verification-results.md`
- [ ] Validar login no `Admin Center`
- [ ] Validar guild filtering no `Admin Center`
- [ ] Validar alteracao de config via `Admin Center`
- [ ] Validar `recover` e `stop` via `Admin Center`
- [ ] Validar revogacao de admin/bot removido no `Admin Center`
- [ ] Subir o bot em ambiente real
