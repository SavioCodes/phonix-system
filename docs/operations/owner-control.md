# PHONIX Owner Control

## Referencias oficiais da `v2.2.0`

- Owner global: `976586934455513159`
- Official guild: `1489363867023835310`

Esses IDs sao tratados como referencias oficiais do runtime e da operacao do PHONIX na linha `v2.2.0`.

## O que a linha `v2.x` adiciona

- Uma camada central de reconhecimento do owner em `src/core/security/ownerAccess.ts`
- Bypass administrativo controlado para o owner em fluxos de `config` e `doctor`
- Namespace seguro `/owner` com status global, incidentes, guilds, guild oficial e teste de notificacao privada
- DM automatica ao owner quando o bot fica online de verdade
- Tratamento explicito da guild oficial dentro do resumo operacional do owner

Documentacao relacionada:

- `README.md`
- `docs/README.md`
- `docs/releases/project-tracker.md`
- `docs/releases/changelog.md`

## Como o owner e reconhecido

- O PHONIX usa apenas o Discord User ID `976586934455513159`
- Nao existe autorizacao por username, tag, nickname ou nome global
- A regra central mora em `src/core/security/ownerAccess.ts`

## O que o owner pode fazer

### Namespace `/owner`

- `/owner status`
- `/owner incidents`
- `/owner guilds`
- `/owner official-guild`
- `/owner notify-test`

### Bypass administrativo controlado

- O owner pode usar o fluxo administrativo no prefixo mesmo sem permissao de administrador na guild
- Isso vale para `!config` e `!doctor`

Observacao importante:

- Os slash commands `/config`, `/doctor` e `/owner` continuam com `default member permissions` administrativas no catalogo do Discord
- Entao a visibilidade desses tres comandos ainda segue a politica nativa do Discord
- O acesso global do owner fica garantido por:
  - `!config`
  - `!doctor`
  - `!owner`

Isso e intencional para nao expor `config`, `doctor` e `owner` visualmente a todos os usuarios do servidor.

## DM automatica de online

Quando o `ClientReady` dispara e o PHONIX termina o trecho principal de startup, o bot tenta enviar DM ao owner com:

- nome do bot
- versao atual
- horario do online
- ping basico
- quantidade de guilds conectadas
- estado da guild oficial
- status basico de banco
- status basico de FFmpeg
- status basico de slash commands
- status basico do pipeline de playback
- resumo curto de observabilidade inicial
- alertas criticos detectados na subida, quando existirem

## Antispam e falha de DM

- A notificacao automatica de startup e tentada apenas uma vez por ciclo de processo
- Se a entrega falhar, o PHONIX registra warning no logger e warning operacional no runtime
- O owner pode validar manualmente o fluxo usando `/owner notify-test`

## Guild oficial

A guild `1489363867023835310` e tratada como referencia operacional importante:

- entra no resumo de startup do owner
- aparece em `/owner status`
- ganha uma visao dedicada em `/owner official-guild`
- fica destacada em `/owner guilds`

O PHONIX nao inventa saude da guild oficial:

- se a guild nao puder ser resolvida, o bot marca isso explicitamente como ausencia ou indisponibilidade
- se a guild estiver presente, o resumo inclui nome, member count quando disponivel, defaults da guild e estado basico de sessao/recovery

## Logs e trilha auditavel

- O startup continua registrando `PHONIX online`
- Quando a DM do owner e entregue, o runtime registra `Owner startup DM delivered`
- Quando a entrega falha, o runtime registra `Owner startup DM not delivered`
- Falhas de entrega tambem geram runtime warning operacional

## Limites conhecidos

- `PARCIAL`: a entrega de DM real depende das configuracoes de DM/privacidade da conta do owner no Discord
- `PARCIAL`: `/config`, `/doctor` e `/owner` em slash continuam sujeitos a visibilidade nativa de admin do Discord
- `NAO IMPLEMENTADO AINDA`: surface owner para mutacoes arbitrarias por guild fora do que ja existe em `config`, `doctor` e `/owner`
