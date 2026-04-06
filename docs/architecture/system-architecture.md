# PHONIX Architecture

## Estrutura

```text
src/
  app/
    bootstrap.ts
    create-phonix-app.ts
    register-client-events.ts
    service-container.ts
  core/
    config/
    database/
    discord/
    logging/
    security/
  modules/
    commands/
    dashboard/
      http/
      services/
      use-cases/
    diagnostics/
      use-cases/
    library/
      services/
      use-cases/
    music/
      use-cases/
    ui/
  scripts/
    support/
tests/
  support/
docs/
  architecture/
  operations/
  verification/
  releases/
  governance/
prisma/
assets/
```

## Responsabilidades

### `src/app`

- Faz a composicao da aplicacao.
- Conecta `config`, `client`, `player`, `prisma`, `services`, eventos e a superficie web opcional.
- Controla bootstrap e shutdown do processo.

### `src/core`

- Guarda infraestrutura transversal e reutilizavel.
- `config`: leitura e validacao de ambiente.
- `database`: criacao do Prisma Client.
- `discord`: fabrica do cliente Discord.
- `logging`: logger central.
- `security`: policy central de owner access e referencias operacionais fixas, como owner global e guild oficial.
- `version`: versao publica da aplicacao.

### `src/modules/commands`

- Contem o framework interno de comando.
- Concentra parsing de slash/prefixo, contexto de execucao, precondicoes, erros tipados, executor central, presenters e registry.
- Separa as definicoes de playback, biblioteca, configuracao, diagnostico e utilitarios.
- Na `v2.0.5`, `ownerCommands.ts` passa a fazer parte da superficie de operacao restrita do bot, sem misturar owner access com o catalogo administrativo comum.
- Na `v1.9.0`, os comandos passaram a ser adaptadores finos: parseiam args, chamam um use case e apresentam o resultado.
- Na `v1.9.1`, o `help` ganhou um handler proprio de componentes para navegar entre paginas sem misturar UI interativa com a pipeline de comandos.
- Na `v2.3.0`, `panelActions.ts` e `panelInteractions.ts` formalizam um trilho proprio para paines acionaveis: a camada de comandos passa a abrir superficies que podem ser atualizadas no mesmo painel, sem transformar clique em atalho magico fora do dominio.
- Na revisao `v1.9.4`, os comandos ganharam guias compartilhados de uso, parse errors mais orientados e consistencia maior entre slash e prefixo, especialmente em `config`, `favorite`, `playlist`, `queue`, `nowplaying` e `doctor`.
- Na revisao `v1.9.5`, o catalogo ficou mais enxuto: `join`, `leave` e `autoplay` sairam da superficie publica, enquanto `play`, `recover`, `stop` e `config autoplay` absorveram o fluxo final de conexao, encerramento e configuracao.
- Na revisao `v2.0.3`, a camada de comandos foi refinada sem trocar a arquitetura: descricoes, respostas de sucesso/erro, hints e consistencia visual foram melhorados em playback, biblioteca, help, config e doctor.
- No hardening mais recente ainda dentro da linha `v2.1.0`, a borda de comandos ficou mais previsivel: `recover`, `config`, `favorite` e `playlist` passaram a devolver mais contexto de origem/estado e erros de validacao com titulos mais claros quando o dominio bloqueia a acao.
- No passe seguinte ainda dentro da mesma linha `v2.1.0`, `playbackCommands.ts`, `libraryCommands.ts`, `configCommands.ts`, `doctorCommands.ts` e `command-guides.ts` ficaram mais alinhados ao uso real: descricoes mais claras, exemplos melhores e menos atrito entre slash, prefixo e help contextual.

### `src/modules/dashboard`

- Introduz a segunda superficie do produto na linha `v2.x`: o `Admin Center`.
- Usa `Fastify` server-rendered no mesmo runtime do bot; nao existe SPA separada nem deploy web independente.
- `http/createDashboardServer.ts` concentra rotas HTML/API, cookies assinados, CSRF e integracao com OAuth Discord.
- `services/discordOAuthService.ts` encapsula exchange de code, refresh de token, leitura do usuario autenticado e guild filtering baseado no OAuth.
- `services/dashboardSessionsService.ts` persiste sessoes do painel em SQLite com TTL padrao de `24h`, tokens OAuth cifrados em repouso e timestamps de sincronizacao da autorizacao.
- Na `v2.0.2`, o `Admin Center` passou a revalidar o acesso administrativo ao longo da sessao: leituras stale fazem sync com Discord, mutacoes forcam refresh, e sessoes com OAuth invalido sao descartadas com seguranca.
- `use-cases/dashboardUseCases.ts` reaproveita `doctor`, `GuildSettingsService`, `PlaybackSessionsService`, `PlaybackSessionManager`, `OperationalTelemetryService` e `MusicService` para montar DTOs estaveis de overview, config, diagnostics e operations.
- O painel e explicitamente administrativo: ele nao toca musica via web, nao edita fila e nao substitui a interface principal do Discord.

### `src/modules/diagnostics`

- Centraliza checks operacionais do bot.
- Valida ambiente, FFmpeg, banco, runtime Discord, slash commands e permissoes.
- Mantem telemetria operacional por guild com incidentes recentes, falhas por codigo, sinais de playback e estatisticas de recovery.
- Persiste incidentes operacionais em SQLite para sobrevivencia apos restart.
- Captura warnings upstream conhecidos e os torna auditaveis no diagnostico.
- Entrega relatorios reutilizaveis para comandos administrativos.
- `use-cases/adminUseCases.ts` orquestra `doctor`, `config` e `help` sem acoplar a camada de comando ao detalhe dos services.
- Ainda dentro da linha `v2.1.0`, `adminUseCases.ts` ganhou ajuda mais contextual por guild: `help` passou a sugerir a proxima acao com base em fila ativa, recover pronto, permissao admin e estado da sessao.
- Na `v2.0.5`, `services/ownerControlService.ts` passa a concentrar a operacao global do owner: DM automatica de startup, leitura da guild oficial, status global, incidentes recentes e namespace `/owner`.
- Na linha `v2.x`, o `doctor` passou a incluir versao publica e estado do `Admin Center`, alem de permitir leitura em contexto web por `guildId`, `textChannelId` e `voiceChannelId`.
- Na `v2.1.0`, o diagnostico de sessao deixa de ser binario: `doctor` e telemetria passam a distinguir session health saudavel, recuperavel, parcial, quebrada ou desativada.

### `src/modules/library`

- Reune a persistencia funcional da biblioteca do usuario.
- Mantem favoritos, playlists, historico, configuracoes por guild e sessoes persistidas de playback.
- `use-cases/libraryUseCases.ts` concentra o fluxo de favoritos, playlists e historico em contratos simples para a UI.
- No endurecimento mais recente da linha `v2.1.0`, a biblioteca passou a entregar mais contexto acionavel: favoritos, playlists e historico agora devolvem listas e notices com reutilizacao mais clara, sem inventar novos comandos nem nova superficie.
- No passe seguinte ainda dentro da linha `v2.2.0`, favoritos, playlists e historico ganharam uma superficie de colecao dedicada: `favorite list`, `playlist list` e `history` agora podem subir como paineis `Components V2` com destaque de media quando houver artwork salvo, sem reescrever os fluxos compactos de `add/remove/play`.
- Na `v2.3.0`, essas colecoes deixam de ser puramente `read-first`: favoritos, playlists e historico agora podem expor acoes rapidas de destaque no proprio painel, enquanto mutacoes precisas por nome ou indice continuam command-driven para preservar clareza e previsibilidade.

### `src/modules/music`

- Implementa a camada de musica do bot.
- Isola FFmpeg, serializacao de faixas e integracao com `discord-player`.
- Centraliza opcoes de runtime de voz, incluindo compatibilidade sem DAVE para hosts Windows restritos.
- Mantem separadas as opcoes de fila (`nodeOptions`) e as opcoes efetivas de conexao de voz (`connectionOptions`).
- Centraliza a configuracao do extractor do YouTube, deixando explicito o extractor (`youtubei`), o client usado e o pipeline real de stream configurado (`youtube-dl` ou `youtubei` nativo).
- Mantem perfis de playback separados para YouTube: `compatibility` como padrao estavel e `fidelity` como modo opt-in, com downgrade automatico quando faltar cookie/config suficiente.
- No hardening mais recente ainda dentro da linha `v2.1.0`, o runtime tambem passou a reagir a falha real de stream: se `fidelity/youtubei` nao abrir audio de verdade, o `MusicService` pode degradar a rota ativa para `compatibility/youtube-dl`, repetir a tentativa uma vez e expor o motivo do downgrade para `doctor`, dashboard e owner ops.
- No passe seguinte dessa mesma linha, o runtime passou a usar `PoToken` quando sobe em `fidelity/WEB` e a rodar um probe curto de startup; se o caminho nativo continuar quebrado no ambiente, o bot ja sobe degradado para `compatibility` antes do primeiro comando real.
- Deixa explicito no produto e no diagnostico que links do Spotify hoje entram por bridge: o PHONIX usa metadados do Spotify, mas o audio toca por uma origem compativel.
- Garante que o runtime interno de FFmpeg do `discord-player` use o executavel configurado no ambiente antes de abrir qualquer stream.
- Normaliza URLs do YouTube antes da busca/playback para reduzir falhas com links de mix, `watch` com playlist e formatos curtos.
- Normaliza tambem share links do Spotify e aceita preferencia de source no `play` para buscas em texto.
- Faz preflight de voz no `play` para validar mesmo canal, permissoes do bot e URL suportada antes de entrar no fluxo pesado de busca e stream.
- Confirma inicio real do playback com watcher de eventos antes de declarar sucesso quando a fila ainda nao estava tocando.
- Mantem modos de execucao explicitos no `play`: adicionar ao fim, tocar em seguida ou substituir a fila.
- Aplica limite seguro para playlists grandes e devolve DTOs de resultado mais ricos, com truncamento, canal alvo, autoplay e hint contextual.
- Mantem snapshots persistidos da fila por guild e faz recovery hibrido apos restart.
- Separa persistencia de sessao (`PlaybackSessionsService`) da orquestracao de runtime (`PlaybackSessionManager`).
- Classifica falhas de playback/voz por etapa e provider.
- Executa recovery automatico com retry limitado e criterios de abort para evitar loop infinito por guild.
- `use-cases/playbackUseCases.ts` orquestra acoes publicas como `play`, `recover`, `volume`, `loop` e `stop` sem levar Discord/Prisma cru para a camada de comando.
- O ciclo de sessao ficou mais coerente para usuario final: `play` e `recover` conectam quando necessario, `stop` encerra e desconecta, e o autoplay persistido pertence a `config autoplay`.
- Na linha `v2.x`, `PlaybackSessionManager` ganhou o caminho `recoverForDashboard()` para manter o Admin Center no mesmo trilho operacional do bot, inclusive na telemetria.
- Na `v2.1.0`, `PlaybackSessionManager` passa a emitir uma leitura estruturada de `session health`, incluindo sessao ativa, pendente, parcial, bloqueada ou quebrada; `MusicService.recoverPlaybackSession()` tambem devolve um resultado mais rico sobre o que realmente foi restaurado.
- Na mesma linha visual de `v2.2.0`, `recover` deixa de ser apenas um notice estruturado e passa a usar um painel dedicado de recovery, com contagem de restauradas/puladas, configuracao reaplicada, saude da sessao e destaque visual da faixa recuperada quando esse metadata estiver disponivel.

### `src/modules/ui`

- Guarda identidade visual, tema, builders de embed e DTOs de view consumidos pelos presenters.
- O `help` passou a usar DTOs de pagina e navegacao para gerar uma central interativa stateless.
- `command-guides.ts` centraliza exemplos e resumos de uso dos comandos mais importantes para reduzir drift entre parse, help e documentacao.
- Na `v2.0.3`, `embeds.ts` e `view-models.ts` passaram a carregar mais contexto de sessao para `queue`, `nowplaying`, `config`, `doctor` e notices de biblioteca, elevando a legibilidade sem poluir a interface.
- Na `v2.1.0`, `queue`, `nowplaying`, `config` e `help` passaram a carregar explicitamente session health, ultimo resultado de recovery, prontidao para recover e necessidade de intervencao manual.
- Ainda na linha `v2.1.0`, a camada visual do Discord passou a diferenciar de forma mais forte `success`, `info`, `warning` e `error`, alem de tratar `queue`, `nowplaying`, `config` e `doctor` como paineis operacionais curtos, e nao como dumps de texto.
- Ainda dentro dessa linha, `TrackNoticeView` passou a aceitar campos contextuais e hint de proximo passo, o que permitiu a favoritos e playlists deixar de responder apenas com um card seco de faixa.
- O passe mais recente dessa mesma linha fortaleceu o contrato compartilhado de midia: `trackCards.ts`, `view-models.ts` e `embeds.ts` agora reaproveitam artwork, link e origem da faixa para `play`, `queue` e `nowplaying`, sem abrir um segundo sistema de apresentacao paralelo ao runtime.
- Na `v2.2.0`, a superficie Discord entra em um design system hibrido: `components-v2.ts` concentra paineis densos com `Container`, `Section`, `TextDisplay`, `MediaGallery` e `Separator` para `play`, `queue`, `nowplaying`, `config view` e `doctor`, enquanto `help`, notices compactos e fluxos transacionais curtos continuam em embeds/classic action rows por ergonomia e manutencao.
- No passe seguinte ainda dentro da mesma linha, `components-v2.ts` tambem passa a sustentar `recover` e as colecoes principais da biblioteca (`favorite list`, `playlist list`, `history`), preservando os fluxos curtos de confirmacao no trilho classico e evitando um segundo sistema visual paralelo.
- A mesma linha tambem troca a dependencia de emoji como linguagem principal por branding de asset real do PHONIX em `theme.ts`, permitindo author/footer/media icons consistentes sem criar uma segunda arquitetura de UI.
- Na `v2.3.0`, a camada visual sobe de nivel sem perder criterio: paineis V2 passam a carregar action rows quando a acao e realmente util e pode atualizar a mesma mensagem com clareza, enquanto `help` continua classico por ergonomia de navegacao.
- `src/scripts/verify-playback.ts` e `docs/verification/playback-verification.md` formam a camada operacional de verificacao A/B, unindo checks automatizados locais com roteiro manual de bitrate/perfil no Discord.
- `src/scripts/verify-dashboard.ts` e `docs/verification/admin-center-verification.md` formam a camada operacional do painel web, separando verificacao automatica local de validacao manual do OAuth.
- `docs/verification/playback-verification-results.md` funciona como artefato de saida dessa frente: ele registra o estado atual do ambiente e a matriz manual preenchida, sem misturar resultado com o runbook.

## Referencias oficiais usadas na linha `v2.3.0`

- Discord Components docs: https://docs.discord.com/developers/components/using-message-components
- Discord Components overview: https://docs.discord.com/developers/components/overview
- Discord Components reference: https://docs.discord.com/developers/components/reference
- Discord interactions and response lifecycle: https://docs.discord.com/developers/interactions/receiving-and-responding
- discord.js `InteractionReplyOptions`: https://discord.js.org/docs/packages/discord.js/main/InteractionReplyOptions%3AInterface
- discord.js builders: https://discord.js.org/docs/packages/builders/main
- discord-player events: https://discord-player.js.org/docs/common-actions/adding_events
- discord-player stream sources: https://discord-player.js.org/docs/extractors/stream_sources

Essas referencias sustentam quatro decisoes explicitas desta linha:

- `Components V2` entram apenas onde a hierarquia visual realmente melhora a leitura do produto.
- Paineis V2 so recebem acoes quando o Discord consegue atualizar a mesma mensagem com clareza e sem misturar `content`/`embeds` no mesmo payload.
- `help`, notices compactos e fluxos curtos continuam classicos porque o ganho visual de V2 nao compensa a perda de simplicidade e manutencao nessas superficies.
- Listas de biblioteca podem ganhar acoes de destaque quando isso reduz atrito real, mas favoritos, playlists e historico continuam preservando comandos parametrizados para mutacoes precisas por nome ou indice.
- O pipeline de resposta respeita a restricao oficial de `IS_COMPONENTS_V2`: paineis V2 nao misturam `content` ou `embeds` no mesmo payload.

### `src/scripts`

- Guarda executaveis operacionais e de manutencao, como deploy de slash commands e verificacoes guiadas de playback/dashboard.
- Na `v2.0.4`, helpers de verificacao que estavam misturados aos modulos de runtime foram movidos para `src/scripts/support`, deixando claro que eles pertencem ao fluxo operacional da release e nao ao nucleo do produto.

### `tests`

- `unit`: protege comandos, use cases, services, embeds e wiring de runtime com isolamento forte.
- `integration`: cobre persistencia real em SQLite/Prisma para biblioteca, sessoes e historico operacional.
- `smoke`: valida o ciclo curto de eventos de voz/player para detectar regressao operacional sem depender de Discord real.
- `support`: centraliza fixtures reutilizaveis, incluindo harness SQLite, DTOs de session diagnostics e contexto minimo para testes de comando.

## Regras arquiteturais

- `app` pode conhecer tudo; ele so monta a aplicacao.
- `core` nao depende de `modules`.
- `modules` nao dependem de `app`.
- `commands` usam services e music, mas nao fazem bootstrap.
- `dashboard` usa services/use cases de alto nivel e nao faz bootstrap Discord nem acessa Prisma cru fora do service de sessao.
- `commands` nao conhecem detalhes de recovery, Prisma ou `discord-player`; chamam use cases de alto nivel.
- `dashboard` nao deve duplicar regra de negocio ja existente em `commands`, `music`, `library` ou `diagnostics`; ele consome DTOs de leitura/mutacao.
- `commands` retornam payloads; reply, defer e tratamento de erro ficam no executor.
- `use-cases` orquestram dominio e retornam DTOs estaveis para a camada de apresentacao.
- Mensagens de uso e exemplos devem preferir fontes compartilhadas quando o comando for central para onboarding ou admin.
- Componentes interativos que nao sao comandos devem ter handler dedicado e nao devem entrar no executor de slash/prefixo.
- `services` de persistencia nao conhecem Discord.
- `ui` nao conhece banco nem eventos.
- `tests/support` deve concentrar fixtures e harness compartilhados antes que stubs de runtime e contexto de comando comecem a se duplicar pelos arquivos de teste.

## Melhorias aplicadas nesta reorganizacao

- Bootstrap centralizado em `create-phonix-app.ts`.
- Shutdown isolado em `bootstrap.ts`.
- Cliente Discord extraido para `core/discord`.
- Services centralizados em um container unico.
- Modulos agrupados por responsabilidade funcional.
- Configuracoes administrativas isoladas em um comando proprio.
- Diagnostico de runtime isolado em modulo proprio.
- Pipeline de comandos endurecida com telemetria estruturada e precondicoes reutilizaveis.
- Telemetria operacional por guild adicionada para troubleshooting de voz, extractor, recovery e comando.
- Runtime de playback endurecido com timeout de voz unificado, normalizacao de URL e tratamento explicito de `AbortError`.
- Persistencia de fila e recovery adicionados sem levar regra de banco para a camada de comandos.
- `doctor` fortalecido para ler sinais operacionais reais da guild, estado do player e pipeline de playback.
- `doctor` passou a separar configuracao de playback, bitrate do canal alvo e ultima rota observada pela telemetria, evitando confundir bridge, extractor e stream path.
- `play`, `help` e `doctor` passaram a explicar de forma coerente quando Spotify esta usando bridge, evitando a falsa impressao de source nativo.
- A verificacao de playback passou a ter dois artefatos claros: o runbook operacional e a folha de resultado, o que deixa mais facil repetir a comparacao entre `compatibility` e `fidelity` sem perder historico.
- A linha `v2.x` consolidou o produto em duas superficies: bot Discord + Admin Center web opt-in, mantendo o mesmo runtime, o mesmo banco SQLite e os mesmos services centrais.
- O dashboard passou a reutilizar `doctor`, `config`, `recovery`, telemetria e sessao persistida sem criar um backoffice paralelo ou fora da arquitetura principal.
- A revisao `v2.0.2` endureceu o Admin Center para uso administrativo real: os tokens OAuth passaram a ser cifrados em SQLite, a autorizacao deixou de ser um snapshot fixo do login e o runtime passou a podar sessoes expiradas no startup.
- A revisao `v2.0.3` melhorou a camada de apresentacao dentro do Discord: embeds, notices e DTOs de comandos ficaram mais orientados a contexto, proximo passo e leitura rapida.
- A revisao `v2.0.4` fez um saneamento estrutural de baixo risco: removeu utilitarios mortos em `commands`, consolidou mapeamento de `StoredTrack` no modulo de biblioteca, isolou helpers de verificacao em `src/scripts/support` e criou um harness compartilhado para testes SQLite.
- A revisao `v2.0.5` adicionou um eixo novo de controle seguro: owner access centralizado por Discord User ID, startup DM auditavel e destaque explicito da guild oficial sem abrir privilegios para usuarios comuns.
- A revisao `v2.1.0` fortaleceu a continuidade operacional por guild: o produto passou a distinguir recovery completo, parcial e quebrado no runtime, na telemetria, no `doctor` e nos embeds principais.
- O passe visual mais recente dentro da linha `v2.1.0` reforcou a hierarquia da superficie Discord sem mudar a arquitetura: notices ficaram estruturados, `play` ficou mais facil de escanear e `doctor` passou a se organizar por blocos de leitura rapida.
- A linha `v2.2.0` aprofunda isso sem quebrar a divisao de responsabilidades: `framework.ts` passa a aceitar payloads `Components V2`, `presenters.ts` decide quais superficies sao V2 ou classicas, e `help` permanece no trilho interativo antigo porque a UX dessa central ainda depende melhor de select menu e botoes tradicionais.
- A `v2.3.0` sobe mais um degrau sem virar um redesign arbitrario: `panelActions.ts` define a linguagem de acoes por superficie, `panelInteractions.ts` traduz clique em mutacao/use case e `register-client-events.ts` atualiza o mesmo painel em vez de duplicar respostas no canal.
- Camada de use cases adicionada para reduzir acoplamento entre `commands`, `music`, `library` e `diagnostics`.
- Presenters adicionados para manter mapeamento de UI fora dos comandos e fora dos services.
- Central interativa de `help` adicionada sem criar novos root commands nem persistir estado em banco.
- `play` e `tocar` endurecidos com parse de flags, source opcional e respostas mais informativas sobre fila e playback.
- Biblioteca, config e doctor agora compartilham mais padroes de UX: preflight de voz, permissao admin coerente, mensagens guiadas e embeds com proximo passo.
- `typecheck` promovido a gate oficial de qualidade junto de `build` e `test`.
- Build de producao separado em `tsconfig.build.json` para empacotar apenas o app.
- Documentacao e tracking adicionados em `docs/`.
- Na organizacao publica mais recente do repositorio, a documentacao passou a ser dividida por responsabilidade em `architecture`, `operations`, `verification`, `releases` e `governance`, reduzindo drift entre runbook, roadmap e nota de release.
