// daily.dev OAuth 2.1 client: authorization code + PKCE (S256), refresh-token rotation, revocation.
// Docs: https://docs.daily.dev/oauth-apps
import { pkceChallenge, randomToken } from './crypto.js';

export const AUTHORIZE_URL = 'https://api.daily.dev/auth/oauth2/authorize';
export const TOKEN_URL = 'https://api.daily.dev/auth/oauth2/token';
export const REVOKE_URL = 'https://api.daily.dev/auth/oauth2/revoke';
export const RESOURCE = 'https://api.daily.dev/public/v1';
// read = all GET endpoints (all this bot needs); offline_access = refresh token; openid = user id.
export const SCOPE = 'openid profile offline_access read';

const PENDING_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 10_000;

export class OAuthError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = 'OAuthError';
    this.status = status;
    this.code = code;
  }
  /** The grant is dead (expired/revoked/rotated away): the user must connect again. */
  get requiresReconnect() {
    return this.code === 'invalid_grant' || this.status === 400 || this.status === 401;
  }
}

/** Reads display info from the id_token payload. Display only; never used for authorization. */
function identityFromIdToken(idToken) {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
    return { dailyDevUserId: payload.sub ?? null, username: payload.preferred_username ?? payload.name ?? null };
  } catch {
    return { dailyDevUserId: null, username: null };
  }
}

export class OAuthClient {
  constructor({ clientId, clientSecret, redirectUri, fetchImpl = globalThis.fetch, now = Date.now }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.fetch = fetchImpl;
    this.now = now;
    /** state -> { discordUserId, verifier, expiresAt } */
    this.pending = new Map();
  }

  /** Starts a sign-in for one Discord user. The state is single-use and expires in 10 minutes. */
  createAuthorization(discordUserId) {
    this.#prune();
    const state = randomToken(24);
    const verifier = randomToken(48);
    this.pending.set(state, { discordUserId, verifier, expiresAt: this.now() + PENDING_TTL_MS });

    const url = new URL(AUTHORIZE_URL);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: SCOPE,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
      resource: RESOURCE,
    }).toString();
    return { url: url.toString(), state };
  }

  /** Returns and removes the pending sign-in for this state, or null if unknown/expired. */
  consumeState(state) {
    const entry = state ? this.pending.get(state) : undefined;
    if (!entry) return null;
    this.pending.delete(state);
    return entry.expiresAt >= this.now() ? entry : null;
  }

  #prune() {
    const now = this.now();
    for (const [k, v] of this.pending) if (v.expiresAt < now) this.pending.delete(k);
  }

  async #tokenRequest(params) {
    const res = await this.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({
        ...params,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        resource: RESOURCE,
      }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      throw new OAuthError(body.error_description || body.error || `Token endpoint returned HTTP ${res.status}`, {
        status: res.status,
        code: body.error,
      });
    }
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token ?? params.refresh_token ?? null,
      expiresAt: this.now() + (Number(body.expires_in) || 300) * 1000,
      scope: body.scope ?? '',
      ...(body.id_token ? identityFromIdToken(body.id_token) : {}),
    };
  }

  exchangeCode(code, verifier) {
    return this.#tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      code_verifier: verifier,
    });
  }

  /** Each refresh rotates the refresh token; the caller must store the returned one. */
  refresh(refreshToken) {
    return this.#tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Best-effort RFC 7009 revocation. Never throws. */
  async revoke(token, hint = 'refresh_token') {
    if (!token) return false;
    try {
      const res = await this.fetch(REVOKE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          token,
          token_type_hint: hint,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }).toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
