# daily.dev Discord Search Suggestions

Bot do Discord com o comando `/dailydev busca`, que responde no canal com os posts mais bem avaliados do daily.dev sobre um tema. Pronto para ser submetido ao [daily.dev Marketplace](https://daily.dev/marketplace) como plugin (SKILL.md + link do repositório).

```
/dailydev busca tema:kafka periodo:último mês quantidade:5
```

| Opção | Descrição |
|---|---|
| `tema` (obrigatório) | Tema ou pergunta. Autocomplete sugere tags do daily.dev enquanto você digita |
| `periodo` | últimas 24h, semana, mês (padrão), ano ou todo o período |
| `quantidade` | 1 a 10 posts (padrão 5) |
| `modo` | Palavra-chave (padrão, com paginação) ou Semântica (perguntas em linguagem natural) |
| `privado` | Mostra o resultado só para quem pediu |

A resposta é um embed numerado (título com link, fonte, ▲ upvotes, 💬 comentários, tempo de leitura, tags e link da discussão) com o botão **Mais resultados**.

## Estrutura

```
daily-dev-discord-search/
├── SKILL.md                    # instruções para o agente (campo SKILL.md do marketplace)
├── marketplace-submission.md   # textos prontos: Name, Short description, About, Link
└── bot/
    ├── src/
    │   ├── index.js            # cliente Discord e roteamento das interações
    │   ├── deploy-commands.js  # registra o slash command
    │   ├── commands/dailydev.js# definição, execução, botão "Mais resultados", autocomplete
    │   ├── dailydev.js         # cliente da API pública (token só vai para api.daily.dev)
    │   ├── format.js           # monta o embed (funções puras, testadas)
    │   └── config.js           # leitura e validação do .env
    ├── test/                   # node:test — unidade + 1 smoke test real (se houver token)
    ├── .env.example
    ├── Dockerfile
    └── package.json
```

## Rodando

1. Node.js 18.17+. Em `bot/`: `npm install`
2. `cp .env.example .env` e preencha:
   - `DISCORD_TOKEN` e `DISCORD_CLIENT_ID` — [Discord Developer Portal](https://discord.com/developers/applications) → sua aplicação → Bot / General Information
   - `DISCORD_GUILD_ID` — ID do servidor de teste (opcional; registra o comando na hora)
   - `DAILY_DEV_TOKEN` — https://daily.dev/settings/api
3. Convide o bot: OAuth2 → URL Generator → escopos `bot` + `applications.commands`, permissões `Send Messages` + `Embed Links`
4. `npm run deploy-commands`
5. `npm start` (ou `docker build -t dd-discord . && docker run --env-file .env dd-discord`)

Testes: `npm test` (com `DAILY_DEV_TOKEN` no ambiente, roda também um teste contra a API real).

## Publicando no marketplace

1. Suba a pasta para um repositório público no GitHub (sem o `.env`).
2. Em https://daily.dev/marketplace/submit, cole os textos de `marketplace-submission.md`, o conteúdo de `SKILL.md` e o link do repositório.
3. O time do daily.dev revisa; o status aparece em **Your plugins**.

## Notas de design

- **Somente leitura:** usa `/search/posts`, `/recommend/semantic` e `/search/tags`. Nada de bookmark, follow ou upvote.
- **Sem intents privilegiadas:** só responde ao próprio slash command; não lê mensagens do canal.
- **Quota:** todas as buscas usam o token do dono do bot. Para um bot público em vários servidores, o ideal é registrar um app OAuth no daily.dev.
- **Estado em memória:** a paginação guarda o cursor por 15 min num `Map`. Para rodar várias réplicas, troque por Redis.
