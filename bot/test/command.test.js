import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { autocomplete, data, execute, handleButton } from '../src/commands/dailydev.js';
import { NotConnectedError } from '../src/tokenManager.js';

const config = {
  defaultPeriod: 'month',
  defaultResults: 5,
  tagAutocomplete: false,
  tagAutocompleteMinLength: 3,
  tagAutocompleteDebounceMs: 30,
};
const oauth = { createAuthorization: (id) => ({ url: `https://api.daily.dev/auth/oauth2/authorize?u=${id}`, state: 's' }) };

function fakeTokens({ connected = new Set(['alice']), searchTags = async () => ['kafka', 'apache-kafka'] } = {}) {
  const calls = [];
  return {
    calls,
    store: { get: async (id) => (connected.has(id) ? { username: id, connectedAt: new Date().toISOString() } : null) },
    isConnected: async (id) => connected.has(id),
    withClient: async (id, fn) => {
      calls.push(id);
      if (!connected.has(id)) throw new NotConnectedError();
      return fn({
        searchTags,
        searchPosts: async (q) => ({ posts: [{ id: 'p1', title: `About ${q}`, url: 'https://x.dev/p1' }], nextCursor: 'c2' }),
        semanticSearch: async () => ({ posts: [], nextCursor: null }),
      });
    },
    disconnect: async () => true,
  };
}

function chatInteraction({ user = 'alice', locale = 'en-US', sub = 'search', opts = {} } = {}) {
  const out = {};
  return {
    out,
    user: { id: user },
    locale,
    options: {
      getSubcommand: () => sub,
      getString: (k) => opts[k] ?? null,
      getInteger: (k) => opts[k] ?? null,
    },
    deferReply: async (o) => { out.deferred = o; },
    editReply: async (o) => { out.edit = o; },
    reply: async (o) => { out.reply = o; },
  };
}

test('command JSON has English names with pt-BR localizations', () => {
  const json = data.toJSON();
  const names = json.options.map((o) => [o.name, o.name_localizations?.['pt-BR']]);
  assert.deepEqual(names, [['search', 'buscar'], ['connect', 'conectar'], ['disconnect', 'desconectar'], ['status', undefined]]);
  const search = json.options[0];
  assert.deepEqual(search.options.map((o) => o.name_localizations['pt-BR']), ['tema', 'periodo', 'quantidade', 'modo']);
});

test('search by a user without a linked account only shows a private connect button', async () => {
  const tokens = fakeTokens();
  const i = chatInteraction({ user: 'bob', opts: { query: 'kafka' } });
  await execute(i, { tokens, oauth, config });
  assert.equal(i.out.deferred.flags, MessageFlags.Ephemeral);
  assert.match(i.out.edit.content, /Connect your daily\.dev account/);
  assert.equal(i.out.edit.components[0].components[0].data.url, 'https://api.daily.dev/auth/oauth2/authorize?u=bob');
  assert.deepEqual(tokens.calls, [], 'no API call is made for an unlinked user');
});

test('search runs with the caller\'s own token and the reply is ephemeral, in pt-BR when asked', async () => {
  const tokens = fakeTokens();
  const i = chatInteraction({ locale: 'pt-BR', opts: { query: 'kafka' } });
  await execute(i, { tokens, oauth, config });
  assert.deepEqual(tokens.calls, ['alice']);
  assert.equal(i.out.deferred.flags, MessageFlags.Ephemeral);
  assert.match(i.out.edit.embeds[0].footer.text, /último mês/);
  const labels = i.out.edit.components[0].components.map((b) => b.data.label);
  assert.deepEqual(labels, ['Mais resultados', 'Compartilhar no canal']);
});

test('only the searcher can press Share; sharing posts titles and links only', async () => {
  const tokens = fakeTokens();
  const i = chatInteraction({ opts: { query: 'kafka' } });
  await execute(i, { tokens, oauth, config });
  const shareId = i.out.edit.components[0].components[1].data.custom_id;

  const other = { customId: shareId, user: { id: 'mallory' }, locale: 'en-US', reply: async (o) => { other.out = o; } };
  await handleButton(other, { tokens });
  assert.match(other.out.content, /Only the person who ran this search/);
  assert.equal(other.out.flags, MessageFlags.Ephemeral);

  const owner = { customId: shareId, user: { id: 'alice' }, locale: 'en-US', reply: async (o) => { owner.out = o; } };
  await handleButton(owner, { tokens });
  assert.equal(owner.out.flags, undefined, 'share is the one public message');
  assert.match(owner.out.content, /<@alice> shared daily\.dev posts about \*\*kafka\*\*/);
  assert.deepEqual(owner.out.allowedMentions, { parse: [] });
});

function acInteraction(user, value, sink) {
  return { user: { id: user }, options: { getFocused: () => value }, respond: async (c) => sink.push(c) };
}

test('autocomplete is off by default and never calls the API', async () => {
  const tokens = fakeTokens();
  const sink = [];
  await autocomplete(acInteraction('alice', 'kafka', sink), { tokens, config });
  assert.deepEqual(sink[0], [{ name: 'kafka', value: 'kafka' }]);
  assert.deepEqual(tokens.calls, []);
});

test('enabled autocomplete: min length, debounce, per-user token and cache', async () => {
  const tokens = fakeTokens();
  const cfg = { ...config, tagAutocomplete: true };
  const sink = [];
  await autocomplete(acInteraction('alice', 'ka', sink), { tokens, config: cfg }); // below min length
  // Three fast keystrokes: only the last one may hit the API.
  await Promise.all(['kaf', 'kafk', 'kafka'].map((v) => autocomplete(acInteraction('alice', v, sink), { tokens, config: cfg })));
  assert.deepEqual(tokens.calls, ['alice']);
  assert.ok(sink.some((c) => c.some((x) => x.value === 'apache-kafka')));

  await autocomplete(acInteraction('alice', 'kafka', sink), { tokens, config: cfg }); // cached
  assert.equal(tokens.calls.length, 1);
  await autocomplete(acInteraction('bob', 'kafka', sink), { tokens, config: cfg }); // unlinked user: no suggestions
  assert.deepEqual(sink.at(-1), [{ name: 'kafka', value: 'kafka' }]);
});
