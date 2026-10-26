# Submissão ao daily.dev Marketplace (v2, após o feedback da revisão)

## Name (3–60 caracteres)

Discord Search Suggestions

## Short description (até 300 caracteres)

A Discord bot where each member links their own daily.dev account and runs /dailydev search to get a private list of top community-ranked posts on any topic, with an option to share the links in the channel.

## About (até 20.000 caracteres, SEM links nem imagens)

Discord Search Suggestions brings daily.dev into the place where your team already asks for reading recommendations, while keeping every request tied to the person who made it.

Your own account, your own data
Each member links their daily.dev account once with /dailydev connect, through daily.dev OAuth (read-only access). From then on, every search runs with that member's own access token. The bot has no shared or personal token and never answers one person with another person's account. Members can unlink at any time with /dailydev disconnect, which deletes their tokens from the bot and revokes them.

How it works
- /dailydev search query: topic. The reply is private to you: a numbered list of posts with title, source, upvotes, comments, read time, tags and a link to the daily.dev discussion.
- More results loads the next page.
- Share in channel posts only the titles and links you picked, as if you pasted them yourself, with your name on it. Only the person who searched can use these buttons.
- Options: time range (24 hours to all time), number of posts (1 to 10) and keyword or semantic search.
- /dailydev status shows whether your account is linked.

API usage and limits
Searches count against each member's own daily.dev API allowance. On the free tier that is 60 requests per minute and 200 requests per month. One search is one request, and each More results page is one more. Tag suggestions while typing are off by default; if the server owner turns them on they start at 3 characters, wait until you pause typing and are cached per user. The bot only reads: it never bookmarks, follows, upvotes or comments.

Language
Commands and replies are in English, with Brazilian Portuguese names and messages for members whose Discord app is set to Portuguese (for example /dailydev buscar).

Privacy and security
The bot does not read channel messages and needs no privileged Discord intents. Tokens are encrypted at rest, refresh tokens are rotated, and nothing is shared between members.

Setup
The server owner needs Node.js 18 or newer, a Discord application, a daily.dev OAuth app and a public HTTPS address for the sign-in callback. The included agent skill walks your coding agent through configuration, testing and deployment, locally or with the included Dockerfile.

## Link

https://github.com/pedropietro/daily-dev-discord-search
