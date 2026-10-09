---
name: discord-search-suggestions
description: Sets up a Discord bot with a /dailydev busca slash command that turns any topic into a short list of community-ranked daily.dev posts, with tag autocomplete, time window, semantic mode and paging.
---

# Discord Search Suggestions

Your Discord server already asks "anyone read something good about X?" every day. This plugin answers with a slash command: `/dailydev busca tema:<topic>` replies in the channel with the top daily.dev posts on that topic, ranked by the community, each with source, upvotes, comments, read time, tags and a link to the discussion.

You (the agent) help the user stand the bot up from the source code and verify it works. You never post to Discord on the user's behalf and never handle their Discord or daily.dev secrets beyond writing them into a local `.env` file the user asked you to create.

## Requirements

- Node.js 18.17+ and the bot source (the plugin's Link field points to the repository; the code lives in `bot/`).
- A daily.dev personal access token in `DAILY_DEV_TOKEN` (https://daily.dev/settings/api). Base URL `https://api.daily.dev/public/v1`, header `Authorization: Bearer $DAILY_DEV_TOKEN`. Never send the token anywhere except `api.daily.dev`.
- A Discord application with a bot user (https://discord.com/developers/applications): its bot token and application (client) ID.

If the daily.dev MCP server is connected you may use its equivalent tools for the verification step instead of raw HTTP; the bot itself always calls the REST API.

## What the bot calls

| Bot feature | REST call |
|---|---|
| `/dailydev busca` (default, keyword mode) | `GET /search/posts?q=<tema>&limit=<1-10>&time=<day\|week\|month\|year\|all>` |
| "Mais resultados" button | same call with `cursor` from the previous `pagination.cursor` |
| `modo: Semântica` | `GET /recommend/semantic?q=<tema>&limit=<n>&time=<month\|year\|all>` (no paging) |
| Autocomplete on `tema` | `GET /search/tags?q=<typed text>` (cached 10 min) |

All read-only. One request per search, one per page, one per autocomplete keystroke burst.

## Steps

1. **Check the environment.** `node -v` must be 18.17 or newer. In `bot/`, run `npm install`.
2. **Create the `.env`.** Copy `bot/.env.example` to `bot/.env`. Ask the user for each value and write it; do not echo the tokens back in chat. `DISCORD_GUILD_ID` is optional but recommended while testing (commands appear instantly in that server; global commands can take up to an hour).
3. **Verify the daily.dev token** before touching Discord: `GET /search/posts?q=kafka&limit=1&time=year`. A 401 means the token is wrong or revoked; send the user to https://daily.dev/settings/api. Optionally run `DAILY_DEV_TOKEN=... npm test` (unit tests plus one live smoke test).
4. **Invite the bot.** In the Discord developer portal → OAuth2 → URL Generator, select scopes `bot` and `applications.commands` and the permissions `Send Messages` and `Embed Links`. The user opens the URL and picks the server. No privileged intents are needed.
5. **Register the command.** `npm run deploy-commands`. Expect "Registered /dailydev in guild …" or "…globally".
6. **Run it.** `npm start` (or build the included `Dockerfile`). Expect "Logged in as <bot>#0000".
7. **Test with the user.** Ask them to type `/dailydev busca tema:kafka periodo:último mês` in the server and confirm: an embed with numbered posts, a "Mais resultados" button that appends the next page, and tag suggestions while typing.

## Output

Report: Node version, `npm test` result, which registration mode was used (guild or global), and whether the user confirmed the command works. If a step fails, show the exact error and the fix, not a generic message.

## Guardrails

- The bot is read-only on daily.dev: it never bookmarks, follows, upvotes or comments.
- Everyone in the server searches with the token owner's daily.dev quota. Searches are not personalized, so no private data (feed, bookmarks, profile) is exposed. For a bot used by many people on other servers, recommend registering a daily.dev OAuth app instead of a personal token.
- Don't commit `.env`. Don't paste tokens into chat, issues or logs.
- Don't add the `MessageContent` intent or read channel messages; the plugin only reacts to its own slash command.
