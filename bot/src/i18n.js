// English by default; Brazilian Portuguese for users whose Discord client is set to pt-BR.

const en = {
  periods: { day: 'last 24 hours', week: 'last week', month: 'last month', year: 'last year', all: 'all time' },
  modeKeyword: 'keyword',
  modeSemantic: 'semantic search',
  discussion: 'discussion',
  untitled: 'Untitled',
  noResults: (period, mode) =>
    `No posts found (${period}, ${mode}).\nTip: widen the time range, try English terms, or use semantic mode.`,
  footer: (period, mode) => `${period} · ${mode} · searched with your daily.dev account`,
  more: 'More results',
  share: 'Share in channel',
  sharedBy: (user, query) => `📚 ${user} shared daily.dev posts about **${query}**:`,
  shareExpired: 'These results expired. Run the search again to share it.',
  sessionExpired: 'This search expired. Run `/dailydev search` again.',
  notYours: 'Only the person who ran this search can use these buttons.',
  notConnected:
    'Connect your daily.dev account first. Searches run with **your own** account and count against your own API allowance (free tier: 60 requests/min, 200/month).',
  connectButton: 'Connect daily.dev',
  connectPrompt:
    'Click below to sign in to daily.dev and approve **read-only** access. The link works once and expires in 10 minutes.\nThis bot never posts, bookmarks or follows anything for you.',
  alreadyConnected: (who) => `You are already connected${who ? ` as **${who}**` : ''}. Use \`/dailydev disconnect\` to unlink.`,
  disconnected:
    'Disconnected. Your tokens were deleted from this bot and revoked. You can also remove the app under daily.dev → Settings → API → Connected apps.',
  notLinked: 'You have no daily.dev account connected to this bot.',
  status: (who, since) => `Connected${who ? ` as **${who}**` : ''} since ${since}.`,
  rateLimited:
    '⚠️ daily.dev rate limit or monthly allowance reached for your account (free tier: 60/min, 200/month). Try again later.',
  timeout: '⚠️ daily.dev took too long to answer. Try again.',
  genericError: '⚠️ Could not search daily.dev right now. Try again in a moment.',
  reconnect: 'Your daily.dev session expired or was revoked. Run `/dailydev connect` again.',
};

const ptBR = {
  periods: { day: 'últimas 24h', week: 'última semana', month: 'último mês', year: 'último ano', all: 'todo o período' },
  modeKeyword: 'palavra-chave',
  modeSemantic: 'busca semântica',
  discussion: 'discussão',
  untitled: 'Sem título',
  noResults: (period, mode) =>
    `Nenhum post encontrado (${period}, ${mode}).\nDica: amplie o período, tente um termo em inglês ou use o modo semântico.`,
  footer: (period, mode) => `${period} · ${mode} · buscado com a sua conta do daily.dev`,
  more: 'Mais resultados',
  share: 'Compartilhar no canal',
  sharedBy: (user, query) => `📚 ${user} compartilhou posts do daily.dev sobre **${query}**:`,
  shareExpired: 'Esses resultados expiraram. Faça a busca de novo para compartilhar.',
  sessionExpired: 'Essa busca expirou. Rode `/dailydev buscar` de novo.',
  notYours: 'Só quem fez a busca pode usar estes botões.',
  notConnected:
    'Conecte primeiro a sua conta do daily.dev. As buscas usam a **sua própria** conta e contam na sua cota da API (plano gratuito: 60 requisições/min, 200/mês).',
  connectButton: 'Conectar daily.dev',
  connectPrompt:
    'Clique abaixo para entrar no daily.dev e aprovar acesso **somente leitura**. O link vale uma vez e expira em 10 minutos.\nEste bot nunca publica, salva ou segue nada por você.',
  alreadyConnected: (who) => `Você já está conectado${who ? ` como **${who}**` : ''}. Use \`/dailydev desconectar\` para desvincular.`,
  disconnected:
    'Desconectado. Seus tokens foram apagados deste bot e revogados. Você também pode remover o app em daily.dev → Settings → API → Connected apps.',
  notLinked: 'Você não tem conta do daily.dev conectada a este bot.',
  status: (who, since) => `Conectado${who ? ` como **${who}**` : ''} desde ${since}.`,
  rateLimited:
    '⚠️ Você atingiu o limite de requisições ou a cota mensal da sua conta no daily.dev (plano gratuito: 60/min, 200/mês). Tente mais tarde.',
  timeout: '⚠️ O daily.dev demorou para responder. Tente novamente.',
  genericError: '⚠️ Não consegui buscar no daily.dev agora. Tente novamente em instantes.',
  reconnect: 'Sua sessão do daily.dev expirou ou foi revogada. Rode `/dailydev conectar` de novo.',
};

/** @param {string | undefined} locale  Discord interaction.locale, e.g. 'pt-BR', 'en-US' */
export function t(locale) {
  return locale === 'pt-BR' ? ptBR : en;
}

export const STRINGS = { en, ptBR };
