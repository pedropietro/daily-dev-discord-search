// Per-Discord-user daily.dev tokens, encrypted at rest in a single JSON file.
// Good enough for one bot process; swap for a database if you run replicas.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decrypt, encrypt } from './crypto.js';

export class TokenStore {
  constructor({ dataDir, key }) {
    this.file = path.join(dataDir, 'tokens.json');
    this.key = key;
    this.cache = null;
    this.writing = Promise.resolve();
  }

  async #load() {
    if (this.cache) return this.cache;
    try {
      this.cache = JSON.parse(await readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.cache = {};
    }
    return this.cache;
  }

  async #persist() {
    const snapshot = JSON.stringify(this.cache);
    // Serialize writes and replace atomically so a crash never leaves half a file.
    this.writing = this.writing.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, snapshot, { mode: 0o600 });
      await rename(tmp, this.file);
    });
    return this.writing;
  }

  /** @returns {Promise<null | {accessToken, refreshToken, expiresAt, scope, dailyDevUserId, username}>} */
  async get(discordUserId) {
    const all = await this.#load();
    const blob = all[discordUserId];
    if (!blob) return null;
    try {
      return JSON.parse(decrypt(blob, this.key));
    } catch {
      return null; // wrong key or corrupted entry: treat as not connected
    }
  }

  async set(discordUserId, record) {
    const all = await this.#load();
    all[discordUserId] = encrypt(JSON.stringify(record), this.key);
    await this.#persist();
  }

  async delete(discordUserId) {
    const all = await this.#load();
    if (!(discordUserId in all)) return false;
    delete all[discordUserId];
    await this.#persist();
    return true;
  }
}
