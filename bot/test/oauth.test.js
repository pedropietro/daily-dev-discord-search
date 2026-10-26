import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { decrypt, encrypt, pkceChallenge } from '../src/crypto.js';
import { OAuthClient, OAuthError, RESOURCE } from '../src/oauth.js';
import { TokenStore } from '../src/tokenStore.js';
import { NotConnectedError, TokenManager } from '../src/tokenManager.js';
import { handleCallback } from '../src/server.js';

const key = randomBytes(32);

function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init, body: init.body ? Object.fromEntries(new URLSearchParams(init.body)) : null });
    const r = typeof responses === 'function' ? responses(String(url), init) : responses.shift();
    return {
      status: r.status ?? 200,
      ok: (r.status ?? 200) < 400,
      headers: new Headers(r.headers ?? {}),
      json: async () => r.body ?? {},
    };
  };
  return { impl, calls };
}

const tmpStore = async () => new TokenStore({ dataDir: await mkdtemp(path.join(tmpdir(), 'ddbot-')), key });

test('encrypt/decrypt roundtrip and tamper detection', () => {
  const blob = encrypt('secret', key);
  assert.equal(decrypt(blob, key), 'secret');
  const [iv, tag, data] = blob.split('.');
  assert.throws(() => decrypt([iv, tag, data.slice(0, -2) + 'AA'].join('.'), key));
});

test('PKCE S256 matches the RFC 7636 test vector', () => {
  assert.equal(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('authorize URL has PKCE, state, resource and read-only scope', () => {
  const oauth = new OAuthClient({ clientId: 'cid', clientSecret: 's', redirectUri: 'https://bot.example/oauth/callback' });
  const { url, state } = oauth.createAuthorization('discord-1');
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://api.daily.dev/auth/oauth2/authorize');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('resource'), RESOURCE);
  assert.equal(u.searchParams.get('state'), state);
  const scopes = u.searchParams.get('scope').split(' ');
  assert.ok(scopes.includes('read') && scopes.includes('offline_access'));
  assert.ok(!scopes.includes('write'), 'bot must not ask for write');
});

test('state is single-use and expires', () => {
  let now = 0;
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', now: () => now });
  const { state } = oauth.createAuthorization('u1');
  assert.equal(oauth.consumeState(state).discordUserId, 'u1');
  assert.equal(oauth.consumeState(state), null);
  const second = oauth.createAuthorization('u1').state;
  now = 11 * 60 * 1000;
  assert.equal(oauth.consumeState(second), null);
});

test('callback exchanges code with verifier and stores the grant encrypted per Discord user', async () => {
  const { impl, calls } = fakeFetch([
    { body: { access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600, scope: 'openid read offline_access' } },
  ]);
  const oauth = new OAuthClient({ clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://bot/cb', fetchImpl: impl });
  const store = await tmpStore();
  const tokens = new TokenManager({ store, oauth });
  const { state } = oauth.createAuthorization('discord-42');
  const verifier = oauth.pending.get(state).verifier;

  const r = await handleCallback(new URLSearchParams({ state, code: 'CODE' }), { oauth, tokens });
  assert.equal(r.status, 200);
  assert.equal(calls[0].body.grant_type, 'authorization_code');
  assert.equal(calls[0].body.code_verifier, verifier);
  assert.equal(calls[0].body.resource, RESOURCE);
  assert.equal((await store.get('discord-42')).accessToken, 'AT1');

  const raw = await readFile(store.file, 'utf8');
  assert.doesNotMatch(raw, /AT1|RT1/, 'tokens must not be stored in plaintext');
  assert.equal((await stat(store.file)).mode & 0o077, 0, 'token file must be private');
});

test('callback rejects unknown state and user-denied consent', async () => {
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: () => assert.fail('no fetch') });
  const tokens = new TokenManager({ store: await tmpStore(), oauth });
  assert.equal((await handleCallback(new URLSearchParams({ state: 'nope', code: 'x' }), { oauth, tokens })).status, 400);
  const { state } = oauth.createAuthorization('u');
  assert.equal((await handleCallback(new URLSearchParams({ state, error: 'access_denied' }), { oauth, tokens })).status, 400);
});

test('expired access token is refreshed, rotated refresh token is saved', async () => {
  let now = 1_000_000;
  const { impl, calls } = fakeFetch([{ body: { access_token: 'AT2', refresh_token: 'RT2', expires_in: 3600, scope: 'read' } }]);
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: impl, now: () => now });
  const store = await tmpStore();
  const tokens = new TokenManager({ store, oauth, now: () => now });
  await store.set('u', { accessToken: 'AT1', refreshToken: 'RT1', expiresAt: now + 30_000, scope: 'read' });

  assert.equal(await tokens.getAccessToken('u'), 'AT2'); // within 60s skew -> refresh
  assert.equal(calls[0].body.grant_type, 'refresh_token');
  assert.equal(calls[0].body.refresh_token, 'RT1');
  assert.equal((await store.get('u')).refreshToken, 'RT2');
});

test('concurrent requests share one refresh (refresh tokens are single-use)', async () => {
  let n = 0;
  const { impl } = fakeFetch(() => ({ body: { access_token: `AT${++n}`, refresh_token: `RT${n}`, expires_in: 3600, scope: 'read' } }));
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: impl });
  const store = await tmpStore();
  const tokens = new TokenManager({ store, oauth });
  await store.set('u', { accessToken: 'old', refreshToken: 'RT0', expiresAt: 0, scope: 'read' });
  const results = await Promise.all([tokens.getAccessToken('u'), tokens.getAccessToken('u'), tokens.getAccessToken('u')]);
  assert.deepEqual(results, ['AT1', 'AT1', 'AT1']);
  assert.equal(n, 1);
});

test('dead refresh token disconnects the user; transient errors keep the grant', async () => {
  const store = await tmpStore();
  const dead = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: fakeFetch([{ status: 400, body: { error: 'invalid_grant' } }]).impl });
  await store.set('u', { accessToken: 'a', refreshToken: 'r', expiresAt: 0 });
  await assert.rejects(new TokenManager({ store, oauth: dead }).getAccessToken('u'), NotConnectedError);
  assert.equal(await store.get('u'), null);

  const flaky = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: fakeFetch([{ status: 503, body: {} }]).impl });
  await store.set('u', { accessToken: 'a', refreshToken: 'r', expiresAt: 0 });
  await assert.rejects(new TokenManager({ store, oauth: flaky }).getAccessToken('u'), (e) => e instanceof OAuthError && !e.requiresReconnect);
  assert.ok(await store.get('u'));
});

test('withClient uses only that user\'s token and retries once after 401', async () => {
  const seen = [];
  const { impl } = fakeFetch((url, init) => {
    if (url.includes('/oauth2/token')) return { body: { access_token: 'FRESH', refresh_token: 'R2', expires_in: 3600, scope: 'read' } };
    seen.push(init.headers.Authorization);
    return seen.length === 1 ? { status: 401 } : { body: { data: [{ name: 'kafka' }] } };
  });
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: impl });
  const store = await tmpStore();
  await store.set('alice', { accessToken: 'ALICE', refreshToken: 'R1', expiresAt: Date.now() + 3_600_000 });
  await store.set('bob', { accessToken: 'BOB', refreshToken: 'RB', expiresAt: Date.now() + 3_600_000 });
  const tokens = new TokenManager({ store, oauth, fetchImpl: impl });

  const tags = await tokens.withClient('alice', (c) => c.searchTags('kaf'));
  assert.deepEqual(tags, ['kafka']);
  assert.deepEqual(seen, ['Bearer ALICE', 'Bearer FRESH']);
  await assert.rejects(tokens.withClient('carol', (c) => c.searchTags('x')), NotConnectedError);
});

test('disconnect deletes tokens and revokes the refresh token', async () => {
  const { impl, calls } = fakeFetch([{ status: 200 }]);
  const oauth = new OAuthClient({ clientId: 'c', clientSecret: 's', redirectUri: 'r', fetchImpl: impl });
  const store = await tmpStore();
  const tokens = new TokenManager({ store, oauth });
  await store.set('u', { accessToken: 'a', refreshToken: 'RT', expiresAt: 0 });
  assert.equal(await tokens.disconnect('u'), true);
  assert.equal(await store.get('u'), null);
  assert.equal(calls[0].url, 'https://api.daily.dev/auth/oauth2/revoke');
  assert.equal(calls[0].body.token, 'RT');
  assert.equal(await tokens.disconnect('u'), false);
});
