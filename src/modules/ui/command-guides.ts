export interface CommandGuide {
  label: string;
  summary: string;
  slashExamples: string[];
  prefixExamples?: string[];
  tips?: string[];
  adminOnly?: boolean;
}

export type CommandGuideId =
  | 'play'
  | 'queue'
  | 'nowplaying'
  | 'recover'
  | 'volume'
  | 'favorite'
  | 'playlist'
  | 'history'
  | 'config'
  | 'doctor'
  | 'owner'
  | 'help';

export const commandGuides: Record<CommandGuideId, CommandGuide> = {
  play: {
    label: 'play',
    summary: 'Busca uma musica ou URL, conecta o PHONIX se preciso e decide como a faixa entra na sessao atual.',
    slashExamples: ['/play lo-fi hip hop', '/play neon skyline mode:next', '/play after dark source:spotify'],
    prefixExamples: ['!tocar lo-fi hip hop', '!play --next neon skyline', '!play --replace night city'],
    tips: [
      'Use `mode:next` ou `--next` para tocar logo depois da faixa atual.',
      'Use `mode:replace` ou `--replace` para trocar a fila atual com seguranca.',
      'Quando a busca vier do Spotify, o PHONIX usa bridge compativel em vez do source original.',
    ],
  },
  queue: {
    label: 'queue',
    summary: 'Abre um painel de sessao com faixa atual, proximas faixas, playback agora, recovery e leitura rapida da saude da guild.',
    slashExamples: ['/queue'],
    prefixExamples: ['!fila'],
    tips: [
      'Use `queue` quando quiser revisar a ordem completa da sessao e entender se ainda existe algo pendente para recover.',
      'Se nao houver faixa tocando, o painel ajuda a diferenciar fila vazia de sessao persistida pronta para restauracao.',
    ],
  },
  nowplaying: {
    label: 'nowplaying',
    summary: 'Abre um painel focado na faixa atual com progresso, proxima musica, rota de playback, recovery e session snapshot.',
    slashExamples: ['/nowplaying'],
    prefixExamples: ['!agora'],
    tips: [
      'Use `nowplaying` para revisar a musica atual sem abrir a fila inteira.',
      'Depois de um recover, este painel e o jeito mais rapido de confirmar se a sessao voltou ao ar do jeito esperado.',
    ],
  },
  recover: {
    label: 'recover',
    summary: 'Restaura a ultima sessao persistida da guild, reaplica configuracoes da sessao e avisa quando algo ficou parcial.',
    slashExamples: ['/recover'],
    prefixExamples: ['!retomar'],
    tips: [
      'Se o resume queue estiver ativo, o PHONIX tambem tenta auto-recuperar apos restart.',
      'Use `/queue`, `/nowplaying` e `/doctor` depois do recover para validar o que voltou e o que ficou pendente.',
      'Se ja existir fila ativa, o recover nao substitui a sessao atual silenciosamente; o PHONIX avisa e pede para voce decidir o fluxo.',
    ],
  },
  volume: {
    label: 'volume',
    summary: 'Mostra ou ajusta o volume da sessao ativa sem encerrar a fila.',
    slashExamples: ['/volume', '/volume 80'],
    prefixExamples: ['!volume', '!volume 80'],
  },
  favorite: {
    label: 'favorite',
    summary: 'Guarda atalhos pessoais de faixas, mostra os indices salvos e puxa um favorito de volta para a sessao quando voce quiser.',
    slashExamples: ['/favorite add', '/favorite add query:night drive', '/favorite play index:1'],
    prefixExamples: ['!favorite add', '!favorite add night drive', '!favorite play 1'],
    tips: [
      'Sem `query`, o PHONIX tenta salvar a faixa atual da fila.',
      'Use `/favorite list` antes de `/favorite play` se quiser confirmar os indices atuais.',
      'Use `/favorite remove index:x` para manter a lista enxuta quando os indices comecarem a ficar desatualizados para voce.',
    ],
  },
  playlist: {
    label: 'playlist',
    summary: 'Cria playlists pessoais, adiciona ou remove faixas e toca uma playlist salva reaproveitando a sessao atual sempre que der.',
    slashExamples: ['/playlist create name:"mix phonk"', '/playlist add name:"mix phonk"', '/playlist play name:"mix phonk"'],
    prefixExamples: ['!playlist create "mix phonk"', '!playlist add "mix phonk"', '!playlist play "mix phonk"'],
    tips: [
      'No prefixo, nomes com espacos devem ficar entre aspas.',
      'Use `/playlist list` para revisar nomes salvos antes de adicionar ou tocar uma playlist.',
    ],
  },
  history: {
    label: 'history',
    summary: 'Mostra suas ultimas faixas reproduzidas no PHONIX para memoria rapida, reuso e curadoria pessoal.',
    slashExamples: ['/history'],
    prefixExamples: ['!history'],
    tips: [
      'Use o historico como memoria rapida para repetir uma busca manualmente em `/play` ou salvar o que gostou em `/favorite add query:...`.',
    ],
  },
  config: {
    label: 'config',
    summary: 'Mostra e ajusta prefixo, volume padrao, autoplay e Smart Session da guild com leitura rapida da sessao e do recovery.',
    slashExamples: ['/config view', '/config prefix value:?', '/config resumequeue enabled:true'],
    prefixExamples: ['!config view', '!config prefix ?', '!config autoplay on'],
    tips: [
      'Os comandos de config exigem permissao administrativa.',
      'O owner global continua com bypass controlado no prefixo administrativo quando necessario.',
      'Use `config view` antes de editar para revisar prefixo, defaults, Smart Session e o estado atual da guild.',
    ],
    adminOnly: true,
  },
  doctor: {
    label: 'doctor',
    summary: 'Executa um diagnostico operacional completo em blocos de leitura rapida, com runtime, playback, Smart Session, dashboard e observabilidade.',
    slashExamples: ['/doctor'],
    prefixExamples: ['!doctor'],
    tips: [
      'Use o doctor para checar FFmpeg, slash commands, permissoes, player, session health, recovery, dashboard e playback pipeline.',
      'Quando a sessao parecer parcial ou quebrada, o doctor costuma ser o jeito mais rapido de descobrir se vale tentar recover ou se e melhor montar uma fila nova.',
    ],
    adminOnly: true,
  },
  owner: {
    label: 'owner',
    summary: 'Superficie exclusiva do owner global para status, incidentes, guild oficial e teste de notificacao privada.',
    slashExamples: ['/owner status', '/owner official-guild', '/owner incidents', '/owner notify-test'],
    prefixExamples: ['!owner status', '!owner official-guild', '!owner incidents', '!owner notify-test'],
    tips: [
      'Somente o Discord User ID oficial do owner pode usar esta area.',
      'O namespace `/owner` nao substitui o doctor por guild; ele complementa a operacao global do bot.',
    ],
    adminOnly: true,
  },
  help: {
    label: 'help',
    summary: 'Abre a central guiada do PHONIX com paginas para onboarding, playback, biblioteca, recovery e admin, refletindo o estado atual da guild.',
    slashExamples: ['/help'],
    prefixExamples: ['!help'],
    tips: [
      'Use a pagina Recovery quando quiser entender se a guild ainda tem sessao pronta para restore.',
      'A ajuda mostra o estado atual da guild para reduzir tentativa e erro, principalmente em playback, recovery e admin.',
    ],
  },
};

export function getCommandGuide(id: CommandGuideId) {
  return commandGuides[id];
}

export function formatGuideExamples(id: CommandGuideId, source: 'slash' | 'prefix' | 'both' = 'both') {
  const guide = getCommandGuide(id);
  const lines: string[] = [];

  if (source === 'slash' || source === 'both') {
    lines.push(...guide.slashExamples.map((example) => `- ${example}`));
  }

  if ((source === 'prefix' || source === 'both') && guide.prefixExamples) {
    lines.push(...guide.prefixExamples.map((example) => `- ${example}`));
  }

  return lines;
}

export function buildCommandUsageDescription(
  id: CommandGuideId,
  source: 'slash' | 'prefix' | 'both' = 'both',
  extraNote?: string,
) {
  const guide = getCommandGuide(id);
  const sections = [guide.summary];
  const examples = formatGuideExamples(id, source);

  if (examples.length > 0) {
    sections.push(['Exemplos:', ...examples].join('\n'));
  }

  if (guide.tips?.length) {
    sections.push(['Dicas:', ...guide.tips.map((tip) => `- ${tip}`)].join('\n'));
  }

  if (extraNote) {
    sections.push(extraNote);
  }

  return sections.join('\n\n');
}
