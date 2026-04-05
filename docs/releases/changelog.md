# PHONIX Changelog

## `v2.2.0` - Signal Surfaces

- A superficie Discord entrou em uma linha nova e publica de UX visual: `play`, `queue`, `nowplaying`, `config view` e `doctor` agora usam `Components V2` com `Container`, `Section`, `TextDisplay`, `MediaGallery`, `Separator` e `IS_COMPONENTS_V2` quando isso realmente melhora leitura e hierarquia.
- A estrategia visual passou a ser hibrida e explicitamente intencional: `help`, notices curtos, biblioteca e fluxos transacionais compactos continuam em embeds/classic action rows porque essa ergonomia ainda e melhor para mensagens curtas e para navegacao interativa.
- A identidade do bot dentro do Discord deixou de depender de emoji como linguagem principal: `theme.ts` agora centraliza assets oficiais do PHONIX para author/footer/media branding e reforca consistencia entre success, info, warning e error.
- O `play` em slash parou de publicar um painel temporario de busca; ele agora usa o estado nativo de defer do Discord e fecha a resposta final em `Components V2`, o que evita mistura errada entre payload classico e V2.
- `queue` e `nowplaying` ganharam hierarquia visual mais forte e mais limpa, com artwork principal, blocos operacionais curtos, contexto de sessao, recovery, source e proximo passo no mesmo painel.
- `config view` e `doctor` passaram a se comportar como paineis operacionais premium em vez de dumps lineares de embed, mantendo leitura escaneavel em desktop e mobile.
- A documentacao foi alinhada para a nova linha `v2.2.0`, registrando a adocao seletiva de `Components V2`, o que ficou classico por escolha tecnica e as restricoes oficiais do Discord que dirigiram essa decisao.
- A documentacao foi reorganizada por responsabilidade em `docs/architecture`, `docs/operations`, `docs/verification`, `docs/releases` e `docs/governance`, sem perder o conteudo historico dos runbooks e da arquitetura.
- O repositorio ganhou padroes publicos reais em `.github/`, com CI reforcado, issue templates, PR template e `CODEOWNERS`.
- O projeto ganhou `SECURITY.md`, `.editorconfig` e um `.gitignore` mais seguro para exposicao publica, reduzindo risco de ruido local e vazamento acidental de artefatos de ambiente.
- `README.md`, metadados do `package.json`, LICENSE, CONTRIBUTING e a politica de releases foram alinhados para exposicao publica do projeto sem inventar comportamento novo de produto.
- A governanca do repositorio agora deixa explicito que atualizar o bot sem sincronizar documentacao e estado publico do repositorio e trabalho incompleto.
- O fluxo final do `play` ficou mais auditavel: o resultado agora deixa explicito se o PHONIX precisou preparar a conexao de voz, se a sessao ativa foi reaproveitada e se o start real do playback foi confirmado antes da resposta.
- `nowplaying`, `queue` e o resultado do `play` agora usam melhor a metadata de midia disponivel, com artwork/capa, link direto da faixa e origem resumida quando esse contexto existe no runtime.
- O runtime de comandos ficou mais resiliente a expiracao de slash interactions: quando a janela de resposta do Discord ja fechou, o PHONIX aborta a resposta com log controlado em vez de derrubar o processo com `Unknown interaction`.
- O registrador de eventos do cliente agora envolve `InteractionCreate` e `MessageCreate` com tratamento explicito de falhas, impedindo que erros tardios de resposta ou fetch derrubem o bot inteiro.
- O ciclo de recovery e playback tambem ficou mais robusto contra corrida de fila: descarte de queue agora e idempotente, ignora `ERR_NO_GUILD_QUEUE` quando a fila ja sumiu do `discord-player` e reduz warning duplicado quando o recovery automatico ja esgotou tentativas de forma esperada.

## `v2.1.0` - Smart Session

- O PHONIX ganhou uma leitura estruturada de `session health` por guild, distinguindo sessao `saudavel`, `recuperavel`, `parcial`, `quebrada` ou `desativada`.
- `MusicService.recoverPlaybackSession()` e `PlaybackSessionManager` agora devolvem e preservam mais contexto real sobre o recovery: total salvo, total restaurado, total pulado, restauracao da faixa atual, volume reaplicado, loop e autoplay.
- O comando `recover` ficou mais claro e mais auditavel: ele agora diferencia recovery completo de recovery parcial e mostra o que realmente voltou para a sessao.
- `queue` e `nowplaying` passaram a exibir painel de session health, ultimo recovery, quantidade persistida e rota atual de playback quando conhecida.
- O `doctor` agora separa melhor o estado de sessao: saude, prontidao para recover, ultimo bloqueio, ultimo resultado e necessidade de intervencao manual.
- A telemetria operacional ganhou sinais explicitos para `session_pending`, `session_restored`, `session_partial` e `session_broken`.
- A camada visual do Discord recebeu um refinamento forte dentro da mesma linha `v2.1.0`: `success`, `info`, `warning` e `error` agora se distinguem melhor, notices viraram respostas estruturadas, `play` ficou mais escaneavel e `config`/`doctor` passaram a usar blocos de leitura rapida.
- Erros controlados de playback indisponivel ficaram menos secos e mais auditaveis: quando a faixa e encontrada mas o stream nao abre, o PHONIX agora explica melhor o bloqueio, mostra origem/pipeline e orienta o proximo passo com menos repeticao.
- O PHONIX tambem passou a distinguir melhor stream indisponivel de recovery indisponivel: quando existe sessao salva, mas ela nao continua mais tocavel, o erro agora sai com leitura correta de recuperacao em vez de parecer falha generica de stream.
- A leitura de erro para `stream indisponivel` tambem ficou mais honesta: quando o runtime conhece a rota tentada, a resposta agora preserva `origem` e `pipeline` reais; quando nao conhece, o embed deixa isso explicito sem cair em `desconhecida/desconhecido`.
- O watcher de startup do playback tambem passou a preservar a rota da tentativa quando o `playerError` chega antes do primeiro audio; isso corrige o caso em que a resposta ao usuario ainda caia sem `origem/pipeline` mesmo com uma busca valida ja resolvida.
- O PHONIX tambem deixou de mascarar fallback interno de extractor como `YouTube/youtube-dl`: quando o erro observado vier de `_SoundCloudExtractor`, a resposta controlada agora assume essa rota observada como `SoundCloud (fallback interno)` com pipeline `extractor-fallback`, sem fingir suporte publico a `source:soundcloud`.
- O runtime agora tambem bloqueia stream vindo do `SoundCloudExtractor` e deixa de registrar esse extractor no bundle padrao, porque `source:soundcloud` continua fora da superficie publica do PHONIX. Isso evita fallback operacional incoerente em tentativas normais de YouTube.
- A classificacao de rota de playback tambem foi corrigida para usar a configuracao real do runtime: quando o bot sobe em `fidelity/youtubei`, erros de stream, telemetry e paines de sessao deixam de cair incorretamente em `youtube-dl` por causa de fallback global de helper.
- Falhas de stream agora limpam a fila residual vazia logo depois da tentativa abortada, evitando que `doctor`, `queue` e `session health` tratem uma fila sem faixa como sessao `active/healthy`.
- O `doctor` e o diagnostico de sessao tambem deixaram de marcar fila fantasma como playback ativo; quando a tentativa falha antes de criar faixa/fila real, o runtime volta a mostrar `Nenhuma fila ativa` de forma coerente.
- Quando o bloqueio real acontece em `YouTube/youtubei`, o erro controlado agora sugere explicitamente testar `compatibility` como contraprova operacional, sem fingir que o stream falho foi resolvido pelo app.
- O runtime tambem ganhou mitigacao real para esse caso: quando um stream falha de verdade em `fidelity/youtubei`, o `MusicService` pode degradar a rota ativa para `compatibility/youtube-dl`, repetir a tentativa uma vez e expor o downgrade em `doctor`, dashboard e visoes operacionais.
- O endurecimento seguinte aprofundou essa mitigacao com pesquisa e reproducao local do problema: o PHONIX agora ativa `PoToken` quando sobe em `fidelity/WEB` e executa um probe curto de startup; se o `youtubei` nativo continuar falhando com erro real de `decipher`, o runtime ja sobe degradado para `compatibility/youtube-dl`, evitando a primeira tentativa quebrada no Discord.
- Favoritos e playlists deixaram de responder apenas com um card seco de faixa: agora esses atalhos mostram origem do item salvo, contexto da playlist/sessao e proximo passo recomendado.
- `config` e `recover` ficaram menos ambiguos quando o dominio bloqueia a operacao: prefixo invalido, volume invalido, sessao ausente e fila ja ativa agora chegam com titulos mais claros e feedback mais orientado.
- A central `help` e a area admin receberam leitura melhor do estado atual da guild, o que ajuda onboarding e troubleshooting sem abrir novas superficies ou mudar a arquitetura.
- Um novo passe ainda dentro da mesma linha `v2.1.0` aprofundou a UX de comandos: `loop` ficou mais legivel no slash e no prefixo, `history` ganhou reutilizacao mais clara, favoritos/playlists/listas ficaram mais guiados e o `help` passou a sugerir a proxima acao com base no estado real da guild.
- A suite automatica tambem ficou mais rigida e mais util para manutencao: os testes agora exigem assertions explicitas e cobrem melhor `help`, `history`, `doctor`, `stop`, `nowplaying`, `setDefaultVolume` e a classificacao de erro entre stream e recovery.
- `README`, `ARCHITECTURE`, `PROJECT_TRACKER` e docs operacionais impactadas foram alinhadas para a leitura real da `v2.1.0`.

## `v2.0.5` - Owner Control, Online DM & Official Guild Operations

- O PHONIX ganhou uma camada central de owner access baseada no Discord User ID oficial `976586934455513159`, sem depender de username, apelido ou permissao derivada de nome.
- O bot agora tenta enviar uma DM automatica ao owner quando fica online de verdade, com resumo operacional curto e util do runtime: versao, ping, guilds conectadas, banco, FFmpeg, slash commands, playback pipeline, observabilidade e status da guild oficial.
- A guild oficial `1489363867023835310` passou a ser tratada como referencia operacional de primeira classe, com leitura dedicada no runtime e destaque dentro da superficie owner.
- O projeto ganhou o namespace `/owner` com `status`, `incidents`, `guilds`, `official-guild` e `notify-test`, todos protegidos por policy explicita e restrita ao owner.
- `/owner` tambem passou a seguir visibilidade administrativa no catalogo slash; o acesso global do owner continua garantido por `!owner`.
- `config` e `doctor` agora aceitam bypass administrativo controlado para o owner no prefixo, sem relaxar a seguranca para outros usuarios.
- A documentacao principal ganhou o runbook `docs/operations/owner-control.md` e foi alinhada para a leitura operacional da `v2.0.5`.

## `v2.0.4` - Structural Cleanup & Technical Sanity

- O saneamento estrutural da base removeu utilitarios mortos e fora de lugar em `src/modules/commands`, reduzindo ruido e responsabilidade difusa dentro do modulo de comandos.
- A conversao de favoritos e playlists para `StoredTrack` foi consolidada em `src/modules/library/trackMapping.ts`, eliminando duplicacao local no use case de biblioteca.
- Os helpers de verificacao de playback e dashboard deixaram de morar dentro dos modulos de runtime e passaram para `src/scripts/support`, deixando claro que pertencem ao fluxo operacional da release.
- `verify:playback` e `verify:dashboard` agora compartilham um runtime de execucao comum para a suite automatica local, reduzindo duplicacao entre scripts.
- Os testes de SQLite/Prisma passaram a compartilhar um harness unico em `tests/support/sqliteTestHarness.ts`, o que melhora organizacao, reduz repeticao e ajuda a conter fragilidade de I/O em Windows.
- A documentacao principal foi alinhada para `2.0.4` com a nova leitura estrutural do projeto.

## `v2.0.3` - Command UX & Discord Presentation

- Os comandos do PHONIX foram revisados de ponta a ponta com foco em clareza real de produto: descricoes, mensagens de sucesso, erros guiados e hints de proximo passo ficaram mais consistentes entre slash e prefixo.
- `queue` e `nowplaying` passaram a mostrar mais contexto de sessao dentro do Discord, incluindo progresso, canal alvo, volume, loop, autoplay, fila restante e atalhos uteis.
- Favoritos, playlists e historico deixaram de responder apenas como bloco seco de texto: agora essas areas usam notices mais estruturados e mais orientados a reutilizacao rapida.
- `config view`, `doctor`, `help` e os notices administrativos receberam um tratamento visual mais organizado, com hierarquia melhor e leitura mais rapida para usuario comum e admin.
- `theme`, `view-models`, `presenters` e `embeds` foram alinhados para sustentar uma apresentacao mais profissional sem mudar a arquitetura central do bot.
- `README`, `ARCHITECTURE` e `PROJECT_TRACKER` foram atualizados para refletir a linha `2.0.3` e a revisao dos comandos dentro do Discord.

## `v2.0.2` - Admin Center Auth Hardening

- O `Admin Center` deixou de confiar apenas no snapshot de guilds tirado no login: a sessao agora volta a consultar o OAuth do Discord ao longo do tempo para confirmar se o usuario ainda e admin e se o bot continua instalado na guild.
- `DashboardSession` foi expandida com tokens OAuth cifrados em repouso, expiracao do access token e timestamp da ultima sincronizacao de autorizacao.
- Mutacoes administrativas (`settings`, `recover`, `stop`) agora forcam refresh/revalidacao antes de executar a operacao; se o acesso foi revogado, a guild sai da sessao e a operacao e bloqueada imediatamente.
- Falhas de refresh OAuth agora invalidam a sessao web de forma segura, forcando novo login em vez de manter acesso stale.
- O startup do app passou a podar sessoes expiradas do painel antes de subir a superficie web.
- O projeto ganhou `npm run verify:dashboard` e o runbook `docs/verification/admin-center-verification.md` para separar verificacao automatica local da rodada manual do OAuth/dashboard.
- `README`, `ARCHITECTURE`, `ADMIN_CENTER`, `PROJECT_TRACKER` e os runbooks foram atualizados para refletir a linha `2.0.2`.

## `v2.0.1` - Release Stability Fixes

- A release `2.0.x` foi estabilizada no Windows com correcoes para a suite de testes que dependem de Prisma + SQLite e bootstrap de migrations.
- `prepareSqliteDatabase()` agora reutiliza em memoria a leitura das migrations SQL, reduzindo custo repetido de filesystem durante a suite e em cenarios de bootstrap repetido.
- Os testes de integracao/bootstrap mais pesados passaram a ter timeout explicito maior, evitando falso negativo por I/O lento em ambiente real sem mascarar falha funcional.
- `package.json`, runtime version, testes e documentacao principal foram alinhados para `2.0.1`.

## `v2.0.0` - Admin Center & Release Consolidation

- O PHONIX passa a ter duas superficies oficiais: o bot Discord continua como interface principal, e o novo `Admin Center` web entra como superficie administrativa complementar e opt-in.
- O projeto ganhou um modulo `dashboard` real, com servidor `Fastify` embutido no mesmo runtime do bot, sem SPA separada e sem deploy independente.
- O login do painel usa `Discord OAuth2 Authorization Code Flow`, filtrando apenas guilds em que o bot esteja instalado e o usuario autenticado tenha permissao administrativa.
- Sessoes web agora sao persistidas em SQLite na tabela `DashboardSession`, com cookie HTTP-only assinado, protecao CSRF e TTL padrao de `24h`.
- O painel entrega quatro areas iniciais: `Overview`, `Config`, `Diagnostics` e `Operations`, reaproveitando `doctor`, `GuildSettingsService`, `PlaybackSessionsService`, `PlaybackSessionManager`, `OperationalTelemetryService` e `MusicService`.
- A release publica foi consolidada em `2.0.0`: a versao atual agora aparece no runtime, no `doctor`, no rodape do dashboard e na documentacao principal.
- O dashboard continua opt-in e nao quebra compatibilidade: se faltar configuracao web, o bot Discord sobe normalmente e o `doctor` passa a explicar por que o Admin Center nao ficou efetivo.
- `PARCIAL`: validacao manual do OAuth, da UX visual do painel e de uma guild real ainda depende de rodada manual no Discord/ambiente real.

## `v1.9.9` - Playback Verification

- A fase de verificacao agora tem um fluxo oficial: `npm run verify:playback` executa `typecheck`, `build`, `test` e `test:smoke`, depois imprime a matriz A/B para `64/128/256/384 kbps`.
- O projeto ganhou um runbook dedicado em `docs/verification/playback-verification.md` com procedimento manual para comparar `compatibility` vs `fidelity` dentro do Discord.
- O projeto agora tambem tem um artefato de resultado separado em `docs/verification/playback-verification-results.md`, deixando claro o estado atual do ambiente e o que ainda depende de rodada manual.
- O runbook deixa explicito o que medir em cada rodada: bitrate, perfil efetivo, pipeline, tempo ate o primeiro audio, stutters, falhas e recoveries.
- A verificacao manual passou a orientar o uso do mesmo source do YouTube em todas as rodadas e a nao usar Spotify como base de comparacao de fidelidade por causa do bridge.
- A documentacao da fase agora separa de forma honesta o que ja foi validado localmente com `fidelity` efetivo e o que continua `PARCIAL` ate a comparacao auditiva no Discord real.

## `v1.9.8` - Source Clarity

- O `play` passou a deixar explicito quando a origem Spotify esta operando por bridge, inclusive no embed final e no estado de busca quando o source for forcado para Spotify.
- O `help` passou a ensinar com clareza que links do Spotify resolvem metadados, mas o playback atual nao sai do source original; ele entra por `spotify-bridge`.
- O `doctor` passou a descrever o caminho do Spotify de forma mais honesta, deixando claro que o route atual e bridge e nao source nativo.
- README, arquitetura e tracker foram atualizados para refletir a leitura correta da origem Spotify.
- `source:soundcloud` foi registrado apenas como ideia futura, ainda nao implementada.

## `v1.9.7` - Controlled Playback Profiles

- O YouTube agora trabalha com dois perfis explicitos de playback: `compatibility` como padrao seguro e `fidelity` como modo opt-in.
- `fidelity` so entra de forma efetiva quando existe `YOUTUBE_COOKIE` valido; sem isso, o PHONIX faz downgrade automatico para `compatibility` para preservar a estabilidade padrao.
- `YOUTUBE_STREAM_CLIENT`, `YOUTUBE_COOKIE` e `YOUTUBE_HIGH_WATER_MARK` viraram configuracoes reais do app, com validacao e fallback seguro.
- `YOUTUBE_HIGH_WATER_MARK` passou a ser tratado como ajuste de suavidade e tolerancia de stream, nao como sinonimo de fidelidade.
- O `doctor` agora mostra perfil solicitado, perfil efetivo, client do YouTube, estado do cookie e highWaterMark configurado.
- `.env.example`, README, arquitetura e tracker foram atualizados para refletir a nova estrategia de perfis.

## `v1.9.6` - Playback Pipeline Diagnostics

- O `doctor` deixou de chamar genericamente o stream do YouTube de `fallback` e passou a mostrar a configuracao real do pipeline ativo, incluindo extractor, client do YouTube, route nativa/bridge e stream path observado pelo PHONIX.
- O diagnostico agora exibe o bitrate do canal de voz alvo, deixando explicito o teto real de qualidade imposto pelo Discord para a sessao atual.
- A telemetria operacional de playback passou a persistir `provider` e `pipeline` tambem em sinais de playback, o que ajuda a diferenciar `youtube-dl`, `youtubei` nativo e `spotify-bridge` nas ultimas rotas vistas pela guild.
- O resumo operacional do `doctor` agora mostra a ultima rota de playback observada pela telemetria quando houver historico recente.
- README, arquitetura e tracker foram atualizados para refletir a leitura nova e mais honesta do pipeline.

## `v1.9.5` - Command Catalog Cleanup

- O catalogo publico de comandos foi limpo para reduzir redundancia de produto: `join`, `leave` e `autoplay` standalone sairam da superficie publica.
- O fluxo final de sessao ficou mais coerente: `play` e `recover` conectam automaticamente quando necessario, `stop` passou a ser o comando unico para encerrar e desconectar, e `config autoplay` virou o unico ajuste persistido de autoplay da guild.
- Para suavizar a transicao do prefixo, `stop` absorveu aliases legados de encerramento como `leave`, `sair` e `disconnect`.
- Aliases fracos ou confusos foram podados do catalogo, incluindo `next` em `skip`, `pl` em `playlist`, `cfg` em `config` e `health` em `doctor`.
- O `loop` deixou de mexer no autoplay persistido da guild, evitando que um comando de fila temporaria altere configuracao administrativa.
- Help, README, arquitetura e tracker foram atualizados para refletir a estrutura final enxuta e o novo modelo de uso.
- Suite reforcada com testes estruturais do catalogo, aliases finais e regressao de loop sem efeito colateral administrativo.

## `v1.9.4` - Command System Review

- O sistema de comandos passou por uma revisao transversal para ficar mais consistente entre slash e prefixo, com foco em clareza, mensagens guiadas e robustez real de produto.
- `config` ficou coerente entre slash e prefixo: agora ambos exigem permissao administrativa e o embed de configuracao ganhou atalhos rapidos para os ajustes mais comuns.
- `favorite`, `playlist` e `history` ficaram menos ambiguos para usuarios novos, com respostas mais orientadas ao proximo passo e preflight de voz mais forte para `favorite play` e `playlist play`.
- `queue`, `nowplaying`, `volume`, `loop`, `autoplay`, `recover`, `pause`, `resume`, `skip`, `stop`, `join` e `leave` receberam padronizacao de titulos e feedback mais util.
- `doctor` ganhou bloco de proximos passos derivado dos checks reais, ajudando admins a agir sobre FFmpeg, slash commands, permissoes, Spotify, banco e recovery.
- Novos guias compartilhados reduzem drift entre parse, help e documentacao dos comandos centrais.
- Suite ampliada com testes para permissao admin em `config`, typing em biblioteca, preflight de voz em biblioteca, embeds administrativos e proximos passos do `doctor`.

## `v1.9.3` - Premium Play

- O `play` ganhou preflight real de voz: agora diferencia usuario fora do canal, bot em outro canal e permissao ausente para ver/conectar/falar antes de tentar tocar.
- A busca passou a separar melhor URL nao suportada, nada encontrado e stream indisponivel, com mensagens mais claras e telemetria operacional mais precisa.
- Playlists grandes agora respeitam um limite seguro de fila; o PHONIX informa quando truncar a busca para manter a sessao estavel.
- O resultado visual do `play` ficou mais rico, com tipo do resultado, canal alvo, autoplay, truncamento e dica contextual de proximo passo.
- Slash `play` ganhou estado de busca em andamento e o prefixo passou a sinalizar typing antes da resposta final.
- Suite reforcada com testes de permissao de voz, URL invalida, no-result, limite de fila, truncamento de playlist e pipeline de loading do comando.

## `v1.9.2` - Smart Play

- O comando `play` ganhou modos de fila previsiveis: `queue`, `next` e `replace`, sem perder o fluxo simples de `query` unica.
- O prefixo agora aceita flags opcionais no inicio, como `--next`, `--replace`, `--youtube` e `--spotify`.
- O `MusicService` passou a pesquisar antes de substituir a fila, evitando destruir a sessao atual quando a nova busca falha.
- Respostas do `play` agora mostram estado real do resultado: se tocou agora, se entrou como proxima, posicao na fila, tempo estimado e origem efetiva da busca.
- URLs do Spotify passaram a ser canonizadas para reduzir ruido de parametros de share links.
- `help` e README foram atualizados com exemplos avancados de `play` e `tocar`.

## `v1.9.1` - Interactive Help Command

- O `help` virou uma central interativa com paginas para `Inicio`, `Playback`, `Biblioteca`, `Recovery` e `Admin`.
- A ajuda agora prioriza onboarding pratico para novos usuarios, com exemplos curtos em slash e prefixo.
- O payload de `help` passou a incluir navegacao por `StringSelectMenu` e botoes `Inicio` + `Atualizar`.
- Interacoes do painel de ajuda ficaram restritas ao usuario que abriu o comando, com resposta efemera amigavel para outros usuarios.
- O handler de componentes foi integrado ao `InteractionCreate` sem mudar o catalogo publico de comandos.
- Suite ampliada com testes do use case de `help`, presenter/componentes e handler de navegacao.

## `v1.9.0` - Domain Use Cases & Command Decoupling

- A camada de comandos foi afinada: parsing e reply continuam nos comandos, mas a regra principal migrou para use cases de `music`, `library` e `diagnostics`.
- Novos DTOs internos estabilizam o contrato entre dominio e UI para playback, biblioteca, `config`, `doctor` e `help`.
- Novo `createUseCaseContainer` expoe wiring explicito dos casos de uso sem vazar detalhes do bootstrap para o `registry`.
- Novos presenters concentram a traducao de resultados de dominio em embeds/replies, reduzindo duplicacao nos comandos.
- Suite ampliada com testes diretos de use cases e com adaptacao dos testes de comandos para o novo contrato fino.
- Novo script `npm run typecheck` e CI atualizado para usar `typecheck` como gate oficial junto de `build` e `test`.

## `v1.8.1` - Persistent Ops History

- Telemetria operacional agora persiste incidentes historicos em SQLite na tabela `OperationalIncident`.
- `doctor` passou a consultar historico persistido de falhas/recoveries e warnings upstream, sobrevivendo a restart do processo.
- Novo handler de warnings conhecidos captura e suprime `DEP0040` (`punycode`) no runtime do app, registrando o incidente para diagnostico.
- `OperationalTelemetryService` ganhou `flushPersistence()` para reduzir perda de incidentes no shutdown.
- Suite ampliada com testes de persistencia de telemetria e teste do handler de warnings.

## `v1.8.0` - Deep Operations

- Nova `OperationalTelemetryService` agrega falhas, comandos, sinais de playback, reconnects e recoveries por guild.
- `PlaybackSessionManager` foi endurecido com retry automatico limitado, criterio de abort, supressao de `queueDelete` durante recovery e diagnostico de recovery por guild.
- `register-client-events` agora observa mais eventos reais de voz e player, incluindo `connection`, `connectionDestroyed`, `disconnect`, `emptyChannel`, `pause`, `resume`, `skip`, `finish`, `volumeChange` e `queueDelete`.
- Falhas de playback passaram a ser classificadas por etapa, provider e pipeline em `playbackFaults.ts`.
- `doctor` agora mostra estado do player, pipeline de playback e resumo operacional recente por guild.
- Novos testes cobrem telemetria operacional, retry/abort de recovery, smoke de eventos de voz e diagnostico expandido.
- Novo script `npm run test:smoke` executa a suite curta de smoke tests operacionais.

## `v1.7.0` - Queue Persistence & Recovery

- A fila agora pode ser persistida por guild com faixa atual, proximas faixas, volume, repeat mode e autoplay.
- Novo `PlaybackSessionsService` grava snapshots reutilizando `StoredTrack` em JSON, sem criar formato paralelo.
- Novo `PlaybackSessionManager` sincroniza eventos do player com debounce, limpa sessoes invalidas e executa recovery hibrido no startup.
- Novo comando `recover` com aliases `!recover` e `!retomar` restaura a ultima sessao pendente no canal atual do usuario.
- `config` ganhou `resumequeue`, permitindo ativar ou desativar persistencia e recuperacao de fila por servidor.
- `help`, `config view` e `doctor` agora mostram estado da sessao persistida, auto-recovery e ultimo motivo de bloqueio quando existir.
- O bootstrap do SQLite passou a aplicar migrations pendentes em bancos ja existentes, com baseline automatico das migrations antigas.
- Suite de testes ampliada para 57 testes, incluindo service de sessao, manager de recovery, upgrade de banco e comandos relacionados.

## `v1.6.1` - Playback Stability Pass

- O comando `play` agora confirma `PlayerStart` antes de responder sucesso quando a fila estava parada, evitando falso positivo apos timeout de voz.
- Timeout de conexao de voz unificado em `45s` no `Player`, `queue.connect` e `nodeOptions`.
- Links do YouTube com parametros de mix/playlist agora sao normalizados para URL canonica de video antes da busca.
- Warnings ruidosos de parsing do `youtubei.js` foram silenciados em nivel global, mantendo apenas erros reais.
- Erros controlados de comando passaram a usar `debug` em vez de poluir o console com `warn`.
- Eventos de runtime agora tratam `AbortError` de voz e falhas recuperaveis de stream com severidade mais apropriada e limpeza de fila quebrada.

## `v1.6.0` - Command Engine Hardening

- Novo executor central de comandos com defer, reply e logging padronizados.
- Nova hierarquia de erros tipados para validacao, autorizacao, precondicao, conflito, dependencia e infraestrutura.
- Precondicoes de fila, voz, FFmpeg e administracao centralizadas.
- Comandos principais migrados para retornar payloads em vez de responder diretamente.
- Novo workflow de CI para `build` + `test` em Windows e Linux.

## `v1.4.4` - Command Hardening

- Corrigido o fluxo de biblioteca sem faixa atual para evitar resposta conflitante em `favorite add` e `playlist add`.
- Nomes de playlist agora sao normalizados no service e refletidos de forma consistente nas respostas dos comandos.
- Criacao de playlist duplicada passou a gerar erro de dominio amigavel.
- Suite de testes ampliada com testes diretos de comandos e verificacao estrutural do catalogo de slash commands.

## `v1.4.3` - FFmpeg Runtime Alignment

- O caminho configurado em `FFMPEG_PATH` agora e registrado como source preferencial do runtime `@discord-player/ffmpeg`.
- A inicializacao do app passou a forcar a re-resolucao do FFmpeg antes de qualquer playback.
- Novos testes cobrem prepend, deduplicacao e re-resolucao do source configurado.

## `v1.4.2` - YouTube Stream Fallback

- O erro `Could not extract stream for this track` foi reproduzido localmente e isolado no backend `youtubei` puro.
- O extractor do YouTube passou a usar `useYoutubeDL: true` como fallback padrao para stream extraction.
- A configuracao do extractor foi centralizada em helper proprio para reduzir regressao e facilitar testes.
- Suite de testes ampliada para cobrir configuracao do extractor do YouTube e registro condicional do Spotify.

## `v1.4.1` - Voice Connection Fix

- Pesquisa local do `discord-player` confirmou que a flag de compatibilidade do DAVE precisa entrar em `connectionOptions`, nao em `nodeOptions`.
- `MusicService.join` e `MusicService.play` foram corrigidos para abrir conexoes de voz com `daveEncryption: false`.
- Configuracao de fila e configuracao de conexao de voz agora ficaram separadas para reduzir ambiguidade e regressao.
- Suite de testes ampliada para cobrir `play`, `join` e criacao de fila com 23 testes passando.

## `v1.4.0` - Runtime Hardening

- Build de producao corrigido com `tsconfig.build.json` e `npm run start` validado.
- Bootstrap do SQLite endurecido com inicializacao automatica por migrations versionadas.
- Stack de voz configurado com `daveEncryption: false` para evitar crash em hosts Windows com App Control bloqueando bindings nativos do DAVE.
- Suite de testes ampliada para runtime critico, bootstrap SQLite e `MusicService`.

## `v1.3.0` - Runtime Diagnostics

- Novo modulo de diagnostico com servico dedicado para validar runtime e infraestrutura.
- Novo comando administrativo `/doctor` com suporte a `!doctor`.
- Checagem de FFmpeg, SQLite, Spotify, Discord session, gateway intents, slash commands e permissoes do bot.
- Embed de diagnostico padronizado com blocos de `OK`, `Avisos` e `Erros`.
- Tracker, arquitetura, README e testes atualizados para a nova etapa.

## `v1.2.0` - Guild Configuration

- Novo comando administrativo `/config` com suporte a `!config`.
- Configuracao por servidor para prefixo, volume padrao e autoplay.
- Aplicacao imediata do volume salvo na fila ativa quando houver sessao em andamento.
- Ajuda e embeds atualizados para refletir a nova area administrativa.
- Tracker e testes expandidos para cobrir a nova etapa.

## `v1.1.0` - Architecture Refresh

- Estrutura reorganizada em `app`, `core`, `modules` e `scripts`.
- Bootstrap, servicos e integracoes transversais desacoplados.
- Documentacao inicial da arquitetura adicionada.

## `v1.0.0` - Foundation

- Base do bot criada com TypeScript + Node.js.
- Playback via `discord-player` com YouTube e Spotify bridging.
- Biblioteca pessoal com favoritos, playlists e historico.
- Persistencia em Prisma + SQLite.
