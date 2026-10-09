import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DailyDevClient, DailyDevError } from '../src/dailydev.js';

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: String(url), init });
    const r = responses.shift();
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: new Headers(r.headers ?? {}),
      json: async () => r.body,
    };
  };
  return { impl, calls };
}

test('searchPosts sends token only to api.daily.dev and maps pagination', async () => {
  const { impl, calls } = fakeFetch([
    { body: { data: [{ id: '1' }], pagination: { hasNextPage: true, cursor: 'c1' } } },
  ]);
  const client = new DailyDevClient('dda_test', { fetchImpl: impl });
  const res = await client.searchPosts('kafka streams', { limit: 3, time: 'week' });

  const url = new URL(calls[0].url);
  assert.equal(url.host, 'api.daily.dev');
  assert.equal(url.pathname, '/public/v1/search/posts');
  assert.equal(url.searchParams.get('q'), 'kafka streams');
  assert.equal(url.searchParams.get('limit'), '3');
  assert.equal(url.searchParams.get('time'), 'week');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer dda_test');
  assert.deepEqual(res, { posts: [{ id: '1' }], nextCursor: 'c1' });
});

test('semanticSearch maps day/week to month and caps limit at 20', async () => {
  const { impl, calls } = fakeFetch([{ body: { data: [] } }]);
  const client = new DailyDevClient('dda_test', { fetchImpl: impl });
  await client.semanticSearch('q', { limit: 50, time: 'day' });
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/public/v1/recommend/semantic');
  assert.equal(url.searchParams.get('time'), 'month');
  assert.equal(url.searchParams.get('limit'), '20');
});

test('401 becomes a friendly DailyDevError', async () => {
  const { impl } = fakeFetch([{ status: 401, body: {} }]);
  const client = new DailyDevClient('bad', { fetchImpl: impl });
  await assert.rejects(client.searchPosts('x'), (e) => e instanceof DailyDevError && e.status === 401);
});

test('429 is retried once', async () => {
  const { impl, calls } = fakeFetch([
    { status: 429, headers: { 'retry-after': '0' }, body: {} },
    { body: { data: [{ id: 'ok' }] } },
  ]);
  const client = new DailyDevClient('dda_test', { fetchImpl: impl });
  const res = await client.searchPosts('x');
  assert.equal(calls.length, 2);
  assert.equal(res.posts[0].id, 'ok');
});

test('searchTags returns names and skips empty input', async () => {
  const { impl, calls } = fakeFetch([{ body: { data: [{ name: 'kafka' }, { name: 'apache-kafka' }] } }]);
  const client = new DailyDevClient('dda_test', { fetchImpl: impl });
  assert.deepEqual(await client.searchTags('  '), []);
  assert.equal(calls.length, 0);
  assert.deepEqual(await client.searchTags('kaf'), ['kafka', 'apache-kafka']);
});

// Live smoke test against the real API — runs only when a token is present.
test('live: real search returns posts', { skip: !process.env.DAILY_DEV_TOKEN }, async () => {
  const client = new DailyDevClient(process.env.DAILY_DEV_TOKEN);
  const res = await client.searchPosts('kafka', { limit: 2, time: 'year' });
  assert.ok(res.posts.length > 0);
  assert.ok(res.posts[0].title);
  const tags = await client.searchTags('kaf');
  assert.ok(tags.includes('kafka'));
});
