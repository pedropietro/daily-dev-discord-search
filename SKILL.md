---
name: discord-search-suggestions
description: Sets up a Discord bot where each member links their own daily.dev account (OAuth) and runs /dailydev search to get a private list of community-ranked posts on any topic, with an optional share-to-channel button.
---

# Discord Search Suggestions

Your Discord server already asks "anyone read something good about X?" every day. With this bot, each member links **their own** daily.dev account once (`/dailydev connect`), then `/dailydev search query:<topic>` shows them the top daily.dev posts on that topic. Results are private to the person who searched; they can press **Share in channel** to post the titles and links, just like pasting them by hand.

The bot never uses a shared token: every request runs as the Discord user who asked, with their own daily.dev OAuth access token and their own API allowance.

You (the agent) help the bot owner deploy it from the source code and verify it works. You never post to Discord on anyone's behalf, and you only handle secrets by writing them into a local `.env` the owner asked you to create.

## Requirements

- Node.js 18.17+ and the bot source (the plugin's Link field points to the repository; the code lives in `bot/`).
- A **daily.dev OAuth app**: daily.dev → Settings → API → OAuth apps → Create app. Redirect URI: `<PUBLIC_BASE_URL>/oauth/callback`. Note the client ID and the client secret (shown once).
- A public **HTTPS** URL that reaches the bot's HTTP port (a reverse proxy, a PaaS, or a tunnel for testing).
- A Discord application with a bot user (https://discord.com/developers/applications): bot token and application (client) ID.

The bot does **not** need a personal daily.dev access token. Do not put one in the configuration.

## How the bot uses daily.dev

| Feature | Call | Token |
|---|---|---|
| `/dailydev connect` | OAuth authorization code + PKCE (S256) at `https://api.daily.dev/auth/oauth2/authorize`, scopes `openid profile offline_access read`, `resource=https://api.daily.dev/public/v1` | none yet |
| OAuth callback | `POST https://api.daily.dev/auth/oauth2/token` (code exchange, then refresh with rotation) | client secret |
| `/dailydev search` (keyword, default) | `GET /search/posts?q=&limit=1-10&time=day\|week\|month\|year\|all` | the caller's own |
| More results button | same call with `cursor` | the caller's own |
| `mode: semantic` | `GET /recommend/semantic?q=&limit=&time=month\|year\|all` | the caller's own |
| Tag autocomplete (off by default) | `GET /search/tags?q=` | the caller's own |
| `/dailydev disconnect` | deletes stored tokens and calls `POST https://api.daily.dev/auth/oauth2/revoke` | client secret |

Read-only on daily.dev. Tokens are encrypted at rest with AES-256-GCM, refresh tokens are rotated and only the newest is kept.

## Steps

1. **Check the environment.** `node -v` must be 18.17 or newer. In `bot/`, run `npm install`, then `npm test`.
2. **Create the `.env`.** Copy `bot/.env.example` to `bot/.env` and ask the owner for each value; do not echo secrets back. Generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`. `DISCORD_GUILD_ID` is optional but makes commands appear instantly while testing.
3. **Expose the callback.** Make sure `<PUBLIC_BASE_URL>/healthz` returns `ok` from the internet once the bot runs, and that `<PUBLIC_BASE_URL>/oauth/callback` is registered exactly on the daily.dev OAuth app.
4. **Invite the bot.** Discord developer portal → OAuth2 → URL Generator: scopes `bot` and `applications.commands`, permissions `Send Messages` and `Embed Links`. No privileged intents.
5. **Register the commands.** `npm run deploy-commands`.
6. **Run it.** `npm start`, or build the included `Dockerfile` and mount a volume on `/app/data` so linked accounts survive restarts.
7. **Test with the owner.** They run `/dailydev connect`, approve read access on daily.dev, see "daily.dev connected", then run `/dailydev search query:kafka`. Confirm the reply is private, **More results** works, **Share in channel** posts titles and links, and `/dailydev disconnect` unlinks.

## Output

Report: Node version, `npm test` result, the public callback URL, registration mode (guild or global), and whether the owner confirmed connect, search, share and disconnect. If a step fails, show the exact error and the fix.

## Guardrails

- Never configure a shared or personal daily.dev token; every call must use the requesting user's OAuth token.
- Keep results ephemeral; only the user's explicit Share action posts in the channel.
- Quota: each user has their own allowance (free tier: 60 requests/minute, 200/month). A search is 1 request, each More results page is 1. Leave tag autocomplete off unless the owner wants it; when on it is debounced, starts at 3 characters and is cached per user.
- Don't commit `.env` or the `data/` folder. Don't paste secrets into chat, issues or logs.
- Don't add the `MessageContent` intent or read channel messages.
