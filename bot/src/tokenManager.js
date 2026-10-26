// Hands out a valid access token per Discord user, refreshing (and rotating) as needed.
import { DailyDevClient, DailyDevError } from './dailydev.js';

const REFRESH_SKEW_MS = 60 * 1000;

export class NotConnectedError extends Error {
  constructor() {
    super('This Discord user has not connected a daily.dev account.');
    this.name = 'NotConnectedError';
  }
}

export class TokenManager {
  constructor({ store, oauth, now = Date.now, fetchImpl }) {
    this.store = store;
    this.oauth = oauth;
    this.now = now;
    this.fetchImpl = fetchImpl;
    /** discordUserId -> in-flight refresh promise (refresh tokens are single-use) */
    this.refreshing = new Map();
  }

  isConnected(discordUserId) {
    return this.store.get(discordUserId).then(Boolean);
  }

  async saveGrant(discordUserId, grant) {
    await this.store.set(discordUserId, { ...grant, connectedAt: new Date(this.now()).toISOString() });
  }

  async #refresh(discordUserId, record) {
    if (this.refreshing.has(discordUserId)) return this.refreshing.get(discordUserId);
    const p = (async () => {
      if (!record.refreshToken) {
        await this.store.delete(discordUserId);
        throw new NotConnectedError();
      }
      try {
        const grant = await this.oauth.refresh(record.refreshToken);
        const updated = { ...record, ...grant, dailyDevUserId: record.dailyDevUserId, username: record.username };
        await this.store.set(discordUserId, updated); // always keep the newest refresh token
        return updated;
      } catch (err) {
        if (err?.requiresReconnect) {
          await this.store.delete(discordUserId);
          throw new NotConnectedError();
        }
        throw err; // transient (network, 5xx): keep the stored grant
      }
    })().finally(() => this.refreshing.delete(discordUserId));
    this.refreshing.set(discordUserId, p);
    return p;
  }

  async getAccessToken(discordUserId, { force = false } = {}) {
    const record = await this.store.get(discordUserId);
    if (!record) throw new NotConnectedError();
    if (!force && record.expiresAt - REFRESH_SKEW_MS > this.now()) return record.accessToken;
    return (await this.#refresh(discordUserId, record)).accessToken;
  }

  /**
   * Runs `fn(client)` with a DailyDevClient bound to this user's own token.
   * On 401 (expired/revoked access token) it refreshes once and retries.
   */
  async withClient(discordUserId, fn) {
    const token = await this.getAccessToken(discordUserId);
    try {
      return await fn(new DailyDevClient(token, { fetchImpl: this.fetchImpl }));
    } catch (err) {
      if (!(err instanceof DailyDevError) || err.status !== 401) throw err;
      const fresh = await this.getAccessToken(discordUserId, { force: true });
      return fn(new DailyDevClient(fresh, { fetchImpl: this.fetchImpl }));
    }
  }

  async disconnect(discordUserId) {
    const record = await this.store.get(discordUserId);
    if (!record) return false;
    await this.store.delete(discordUserId);
    await this.oauth.revoke(record.refreshToken, 'refresh_token');
    return true;
  }
}
