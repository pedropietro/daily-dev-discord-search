# Submissão ao daily.dev Marketplace

Campos do formulário em https://daily.dev/marketplace/submit (ou `POST /public/v1/plugins`).

## Name (3–60 caracteres)

Discord Search Suggestions

## Short description (até 300 caracteres)

Adds a /dailydev busca slash command to your Discord server. Type a topic and the bot replies with the top community-ranked daily.dev posts, with tag autocomplete, time window, semantic mode and paging.

## About (até 20.000 caracteres, SEM links nem imagens)

Discord Search Suggestions brings daily.dev into the place where your team already asks for reading recommendations.

How it works
Anyone in the server types /dailydev busca followed by a topic. The bot searches daily.dev and replies in the channel with a numbered list of posts. Each item shows the title, the source, upvotes, comments, read time, up to three tags and a link to the daily.dev discussion. A "Mais resultados" button loads the next page.

Options
- tema: the topic or question. While you type, the bot suggests matching daily.dev tags.
- periodo: last 24 hours, week, month, year or all time.
- quantidade: from 1 to 10 posts.
- modo: keyword search (default) or semantic search for natural-language questions.
- privado: show the result only to the person who asked.

What it touches
The bot only reads. It uses the public search endpoints (posts, semantic recommendations and tags) and never bookmarks, follows, upvotes or comments. It does not read channel messages and needs no privileged Discord intents. Searches are not personalized, so no feed, bookmark or profile data is shared with the server.

Setup
You need Node.js 18 or newer, a Discord application with a bot user and a daily.dev personal access token. The included agent skill walks your coding agent through installing dependencies, creating the environment file, verifying the token, inviting the bot, registering the command and running it, locally or with the included Dockerfile.

Good to know
All searches use the token owner's API allowance. For a public bot used across many servers, register a daily.dev OAuth app instead of using a personal token.

## SKILL.md

Conteúdo de `SKILL.md` (≈4.400 caracteres, abaixo do limite de 50.000).

## Link (até 500 caracteres)

<URL do repositório no GitHub depois de publicar a pasta>
