import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResultsEmbed, buildShareMessage, escapeLabel, formatPostLine, postLink } from '../src/format.js';
import { STRINGS } from '../src/i18n.js';

const post = {
  id: 'abc123',
  title: 'Kafka [4.0] *released*',
  url: 'https://example.com/kafka',
  commentsPermalink: 'https://daily.dev/posts/kafka-abc123',
  source: { name: 'Example Blog' },
  numUpvotes: 42,
  numComments: 7,
  readTime: 5,
  tags: ['kafka', 'java', 'streaming', 'extra'],
};

test('escapeLabel escapes markdown that breaks links', () => {
  assert.equal(escapeLabel('a [b] *c*'), 'a \\[b\\] \\*c\\*');
});

test('postLink falls back to the daily.dev permalink', () => {
  assert.equal(postLink({ id: 'x' }), 'https://app.daily.dev/posts/x');
  assert.equal(postLink(post), 'https://example.com/kafka');
});

test('formatPostLine shows title link, meta and at most 3 tags', () => {
  const line = formatPostLine(post, 1);
  assert.match(line, /^\*\*1\. \[Kafka \\\[4\.0\\\] \\\*released\\\*\]\(https:\/\/example\.com\/kafka\)\*\*/);
  assert.match(line, /Example Blog · ▲ 42 · 💬 7 · 5 min/);
  assert.match(line, /`kafka` `java` `streaming`/);
  assert.doesNotMatch(line, /extra/);
  assert.match(line, /\[discussion\]/);
});

test('buildResultsEmbed numbers from offset and localizes', () => {
  const en = buildResultsEmbed({ query: 'kafka', posts: [post, post], period: 'week', mode: 'keyword', offset: 5 });
  assert.match(en.description, /\*\*6\./);
  assert.match(en.description, /\*\*7\./);
  assert.match(en.footer.text, /last week/);
  const pt = buildResultsEmbed({ query: 'kafka', posts: [post], period: 'week', mode: 'keyword', strings: STRINGS.ptBR });
  assert.match(pt.footer.text, /última semana/);
  assert.match(pt.description, /\[discussão\]/);
});

test('buildResultsEmbed handles empty results', () => {
  const embed = buildResultsEmbed({ query: 'nothing', posts: [], period: 'day', mode: 'semantic' });
  assert.match(embed.description, /No posts found/);
});

test('buildResultsEmbed stays under the Discord description limit', () => {
  const big = { ...post, title: 'x'.repeat(500) };
  const embed = buildResultsEmbed({ query: 'q', posts: Array(10).fill(big), period: 'all', mode: 'keyword' });
  assert.ok(embed.description.length <= 4096);
});

test('buildShareMessage republishes only titles and links, under 2000 chars', () => {
  const msg = buildShareMessage({ userMention: '<@1>', query: 'kafka', posts: Array(10).fill({ ...post, title: 'y'.repeat(150) }) });
  assert.match(msg, /^📚 <@1> shared daily\.dev posts about \*\*kafka\*\*:/);
  assert.doesNotMatch(msg, /▲|💬/);
  assert.ok(msg.length <= 2000);
});
