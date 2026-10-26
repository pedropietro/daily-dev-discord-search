// Minimal daily.dev public API client. One instance per request, bound to ONE user's OAuth access token.
// The token is only ever sent to this fixed host — never build the base URL from user input.
const BASE_URL = 'https://api.daily.dev/public/v1';
const TIMEOUT_MS = 8000;

export class DailyDevError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'DailyDevError';
    this.status = status;
  }
}

export class DailyDevClient {
  constructor(token, { fetchImpl = globalThis.fetch } = {}) {
    if (!token) throw new Error('daily.dev token is required');
    this.token = token;
    this.fetch = fetchImpl;
  }

  async #get(path, params = {}, { retryOn429 = true } = {}) {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }

    const res = await this.fetch(url, {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 429 && retryOn429) {
      const waitSec = Math.min(Number(res.headers.get('retry-after')) || 2, 5);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      return this.#get(path, params, { retryOn429: false });
    }
    if (res.status === 401) {
      throw new DailyDevError('daily.dev access token is invalid or expired.', 401);
    }
    if (res.status === 429) {
      throw new DailyDevError('daily.dev rate limit or monthly quota reached.', 429);
    }
    if (!res.ok) {
      throw new DailyDevError(`daily.dev API error (HTTP ${res.status}).`, res.status);
    }
    return res.json();
  }

  /** Keyword search over all posts. limit 1-50, time: day|week|month|year|all. */
  async searchPosts(query, { limit = 5, time = 'month', cursor } = {}) {
    const body = await this.#get('/search/posts', { q: query, limit, time, cursor });
    return {
      posts: body.data ?? [],
      nextCursor: body.pagination?.hasNextPage ? body.pagination.cursor : null,
    };
  }

  /** AI semantic search, better for natural-language questions. limit 1-20, no pagination. */
  async semanticSearch(query, { limit = 5, time = 'month' } = {}) {
    const body = await this.#get('/recommend/semantic', {
      q: query,
      limit: Math.min(limit, 20),
      time: time === 'day' || time === 'week' ? 'month' : time, // endpoint accepts month|year|all
    });
    return { posts: body.data ?? [], nextCursor: null };
  }

  /** Tag name suggestions, used for slash-command autocomplete. */
  async searchTags(query) {
    if (!query?.trim()) return [];
    const body = await this.#get('/search/tags', { q: query.trim() }, { retryOn429: false });
    return (body.data ?? []).map((t) => t.name).filter(Boolean);
  }
}
