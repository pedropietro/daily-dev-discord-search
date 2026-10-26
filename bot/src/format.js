// Pure formatting helpers (no discord.js imports) so they can be unit-tested.
import { STRINGS } from './i18n.js';

const DAILY_DEV_BLUE = 0x2b7fff;
const MAX_DESCRIPTION = 4000; // Discord limit is 4096
const MAX_MESSAGE = 1900; // Discord limit is 2000
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

export function formatPostLine(post, index, strings = STRINGS.en) {
  const title = escapeLabel(truncate(post.title || strings.untitled, MAX_TITLE));
  const meta = [
    post.source?.name,
    `▲ ${post.numUpvotes ?? 0}`,
    `💬 ${post.numComments ?? 0}`,
    post.readTime ? `${post.readTime} min` : null,
  ].filter(Boolean);
  const tags = (post.tags ?? []).slice(0, 3).map((t) => `\`${t}\``).join(' ');

  return [
    `**${index}. [${title}](${postLink(post)})**`,
    `${meta.join(' · ')}${tags ? ` · ${tags}` : ''} · [${strings.discussion}](${discussionLink(post)})`,
  ].join('\n');
}

/** Plain embed object (compatible with discord.js `embeds: [obj]`). */
export function buildResultsEmbed({ query, posts, period, mode, offset = 0, strings = STRINGS.en }) {
  const periodLabel = strings.periods[period] ?? period;
  const modeLabel = mode === 'semantic' ? strings.modeSemantic : strings.modeKeyword;
  const header = `🔎 daily.dev: ${truncate(query, 200)}`;
  const url = `https://app.daily.dev/search?q=${encodeURIComponent(query)}`;

  if (!posts.length) {
    return { color: DAILY_DEV_BLUE, title: header, url, description: strings.noResults(periodLabel, modeLabel) };
  }

  let description = '';
  posts.forEach((post, i) => {
    const line = formatPostLine(post, offset + i + 1, strings);
    if (description.length + line.length + 2 <= MAX_DESCRIPTION) {
      description += (description ? '\n\n' : '') + line;
    }
  });

  return { color: DAILY_DEV_BLUE, title: header, url, description, footer: { text: strings.footer(periodLabel, modeLabel) } };
}

/**
 * What lands in the channel when a user chooses to share: just titles and links they picked,
 * the same as pasting links by hand. No engagement data from the API is re-published.
 */
export function buildShareMessage({ userMention, query, posts, strings = STRINGS.en }) {
  let text = strings.sharedBy(userMention, escapeLabel(truncate(query, 100)));
  for (const post of posts) {
    const line = `\n• [${escapeLabel(truncate(post.title || strings.untitled, 150))}](<${postLink(post)}>)`;
    if (text.length + line.length > MAX_MESSAGE) break;
    text += line;
  }
  return text;
}
