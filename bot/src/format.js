// Pure formatting helpers (no discord.js imports) so they can be unit-tested.

export const PERIOD_LABELS = {
  day: 'últimas 24h',
  week: 'última semana',
  month: 'último mês',
  year: 'último ano',
  all: 'todo o período',
};

const DAILY_DEV_BLUE = 0x2b7fff;
const MAX_DESCRIPTION = 4000; // Discord limit is 4096
const MAX_TITLE = 200;

/** Escape characters that would break a Discord markdown link label. */
export function escapeLabel(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/([\\[\]()*_~`|>])/g, '\\$1')
    .trim();
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function postLink(post) {
  return post.url || post.commentsPermalink || `https://app.daily.dev/posts/${post.id}`;
}

export function discussionLink(post) {
  return post.commentsPermalink || `https://app.daily.dev/posts/${post.id}`;
}

export function formatPostLine(post, index) {
  const title = escapeLabel(truncate(post.title || 'Sem título', MAX_TITLE));
  const meta = [
    post.source?.name,
    `▲ ${post.numUpvotes ?? 0}`,
    `💬 ${post.numComments ?? 0}`,
    post.readTime ? `${post.readTime} min` : null,
  ].filter(Boolean);
  const tags = (post.tags ?? []).slice(0, 3).map((t) => `\`${t}\``).join(' ');

  return [
    `**${index}. [${title}](${postLink(post)})**`,
    `${meta.join(' · ')}${tags ? ` · ${tags}` : ''} · [discussão](${discussionLink(post)})`,
  ].join('\n');
}

/**
 * Build a plain embed object (compatible with discord.js `embeds: [obj]`).
 * @param {object} opts
 * @param {string} opts.query
 * @param {Array} opts.posts
 * @param {string} opts.period
 * @param {'keyword'|'semantic'} opts.mode
 * @param {number} opts.offset  index of the first post (for pagination numbering)
 */
export function buildResultsEmbed({ query, posts, period, mode, offset = 0 }) {
  const modeLabel = mode === 'semantic' ? 'busca semântica' : 'palavra-chave';
  const header = `🔎 daily.dev: ${truncate(query, 200)}`;

  if (!posts.length) {
    return {
      color: DAILY_DEV_BLUE,
      title: header,
      description:
        `Nenhum post encontrado (${PERIOD_LABELS[period] ?? period}, ${modeLabel}).\n` +
        'Dica: amplie o período, tente um termo em inglês ou use o modo semântico.',
      url: `https://app.daily.dev/search?q=${encodeURIComponent(query)}`,
    };
  }

  let description = '';
  posts.forEach((post, i) => {
    const line = formatPostLine(post, offset + i + 1);
    if (description.length + line.length + 2 <= MAX_DESCRIPTION) {
      description += (description ? '\n\n' : '') + line;
    }
  });

  return {
    color: DAILY_DEV_BLUE,
    title: header,
    url: `https://app.daily.dev/search?q=${encodeURIComponent(query)}`,
    description,
    footer: { text: `${PERIOD_LABELS[period] ?? period} · ${modeLabel} · via daily.dev public API` },
  };
}
