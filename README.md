# daily.dev Discord Search Suggestions

Discord bot where **each member links their own daily.dev account** (OAuth, read-only) and searches daily.dev from Discord. Results are private to whoever searched; a **Share in channel** button posts the titles and links on their behalf.

```
/dailydev connect                     → link your daily.dev account (once)
/dailydev search query:kafka period:last month count:5
/dailydev status | /dailydev disconnect
```

pt-BR clients see `/dailydev conectar`, `/dailydev buscar tema:…`, `/dailydev desconectar` and Portuguese replies.

| Option | Description |
|---|---|
| `query` / `tema` (required) | Topic or question. Optional tag autocomplete (off by default) |
| `period` / `periodo` | last 24h, week, month (default), year, all time |
| `count` / `quantidade` | 1–10 posts (default 5) |
| `mode` / `modo` | Keyword (default, paged) or Semantic (natural-language questions) |

## Why OAuth per user

The daily.dev Public API serves data to the token holder. So the bot never uses a shared token: every request runs with the Discord user's own access token, obtained through a daily.dev OAuth app (authorization code + PKCE, `read` scope only). Each user spends their own allowance (free tier: **60 requests/min, 200/month**).

## Structure

```
bot/src/
├── index.js            Discord client + starts the OAuth callback server
├── server.js           GET /oauth/callback, GET /healthz
├── oauth.js            authorize URL (PKCE S256, state), code exchange, refresh rotation, revoke
├── tokenStore.js       per-user tokens, AES-256-GCM encrypted, atomic writes (data/tokens.json)
├── tokenManager.js     valid token per user, single-flight refresh, retry on 401, disconnect
├── commands/dailydev.js  search / connect / disconnect / status, buttons, autocomplete
├── dailydev.js         Public API client (token only ever sent to api.daily.dev)
├── format.js, i18n.js  embeds and EN / pt-BR strings
└── config.js, deploy-commands.js
```

## Running

1. Node.js 18.17+. In `bot/`: `npm install && npm test`
2. **daily.dev OAuth app**: daily.dev → Settings → API → OAuth apps → Create app. Redirect URI: `https://<your-host>/oauth/callback`.
3. `cp .env.example .env` and fill in:
   - `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` (and optionally `DISCORD_GUILD_ID` for instant registration)
   - `DAILY_DEV_CLIENT_ID`, `DAILY_DEV_CLIENT_SECRET`
   - `PUBLIC_BASE_URL` (HTTPS, reaches `PORT`), `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`)
4. Invite the bot: OAuth2 → URL Generator → scopes `bot` + `applications.commands`, permissions `Send Messages` + `Embed Links`.
5. `npm run deploy-commands`
6. `npm start`, or with Docker:
   ```bash
   docker build -t dd-discord bot/
   docker run --env-file bot/.env -p 3000:3000 -v dd-data:/app/data dd-discord
   ```

For local testing, a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) gives you an HTTPS `PUBLIC_BASE_URL`; register that callback on the OAuth app.

## Design notes

- **Per-user tokens only.** Unlinked users get a private Connect button and no API call is made.
- **Private by default.** Search replies are ephemeral. Share posts titles and links only (no engagement numbers), with mentions disabled.
- **Quota-aware.** 1 request per search, 1 per extra page. Tag autocomplete is opt-in (`ENABLE_TAG_AUTOCOMPLETE=true`), starts at 3 chars, debounced 700 ms, cached per user.
- **Token hygiene.** AES-256-GCM at rest, file mode 600, refresh tokens rotated with a single in-flight refresh per user, revoked on disconnect.
- **Single process.** OAuth state, search sessions and the token file live in one process; use Redis/a database for multiple replicas.
