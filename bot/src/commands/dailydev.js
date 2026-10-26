import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { DailyDevError } from '../dailydev.js';
import { buildResultsEmbed, buildShareMessage } from '../format.js';
import { STRINGS, t } from '../i18n.js';
import { NotConnectedError } from '../tokenManager.js';

export const BUTTON_PREFIX = 'dd:';
const SESSION_TTL_MS = 15 * 60 * 1000;
const TAG_CACHE_TTL_MS = 10 * 60 * 1000;
const PT = 'pt-BR';

// ---------------------------------------------------------------- command definition (EN + pt-BR)

const periodChoices = Object.keys(STRINGS.en.periods).map((value) => ({
  name: STRINGS.en.periods[value],
  name_localizations: { [PT]: STRINGS.ptBR.periods[value] },
  value,
}));

export const data = new SlashCommandBuilder()
  .setName('dailydev')
  .setDescription('Search daily.dev with your own account')
  .setDescriptionLocalizations({ [PT]: 'Busque no daily.dev com a sua própria conta' })
  .addSubcommand((sub) =>
    sub
      .setName('search')
      .setNameLocalizations({ [PT]: 'buscar' })
      .setDescription('Find the best daily.dev posts on a topic')
      .setDescriptionLocalizations({ [PT]: 'Encontra os melhores posts do daily.dev sobre um tema' })
      .addStringOption((o) =>
        o
          .setName('query')
          .setNameLocalizations({ [PT]: 'tema' })
          .setDescription('Topic or question (e.g. kafka, "virtual threads in production")')
          .setDescriptionLocalizations({ [PT]: 'Tema ou pergunta (ex.: kafka, "virtual threads em produção")' })
          .setRequired(true)
          .setMaxLength(200)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('period')
          .setNameLocalizations({ [PT]: 'periodo' })
          .setDescription('Time range')
          .setDescriptionLocalizations({ [PT]: 'Janela de tempo' })
          .addChoices(...periodChoices),
      )
      .addIntegerOption((o) =>
        o
          .setName('count')
          .setNameLocalizations({ [PT]: 'quantidade' })
          .setDescription('How many posts (1-10)')
          .setDescriptionLocalizations({ [PT]: 'Quantos posts (1-10)' })
          .setMinValue(1)
          .setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('mode')
          .setNameLocalizations({ [PT]: 'modo' })
          .setDescription('Search type')
          .setDescriptionLocalizations({ [PT]: 'Tipo de busca' })
          .addChoices(
            { name: 'Keyword (default)', name_localizations: { [PT]: 'Palavra-chave (padrão)' }, value: 'keyword' },
            {
              name: 'Semantic (natural-language questions)',
              name_localizations: { [PT]: 'Semântica (perguntas em linguagem natural)' },
              value: 'semantic',
            },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('connect')
      .setNameLocalizations({ [PT]: 'conectar' })
      .setDescription('Link your daily.dev account (read-only)')
      .setDescriptionLocalizations({ [PT]: 'Vincula a sua conta do daily.dev (somente leitura)' }),
  )
  .addSubcommand((sub) =>
    sub
      .setName('disconnect')
      .setNameLocalizations({ [PT]: 'desconectar' })
      .setDescription('Unlink your daily.dev account and delete your tokens')
      .setDescriptionLocalizations({ [PT]: 'Desvincula a sua conta do daily.dev e apaga seus tokens' }),
  )
  .addSubcommand((sub) =>
    sub
      .setName('status')
      .setDescription('Show whether your daily.dev account is connected')
      .setDescriptionLocalizations({ [PT]: 'Mostra se a sua conta do daily.dev está conectada' }),
  );

// ---------------------------------------------------------------- in-memory state (single process)

/** sessionId -> { userId, query, mode, period, limit, cursor, offset, posts, locale, expiresAt } */
const sessions = new Map();
/** `${userId}:${prefix}` -> { tags, expiresAt }  (per user: one user's API results are never shown to another) */
const tagCache = new Map();
/** userId -> latest autocomplete sequence number, for debouncing */
const autocompleteSeq = new Map();

function saveSession(session) {
  const id = randomUUID().replaceAll('-', '').slice(0, 16);
  sessions.set(id, { ...session, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
  for (const [k, v] of tagCache) if (v.expiresAt < now) tagCache.delete(k);
}, 60 * 1000).unref();

const ephemeral = { flags: MessageFlags.Ephemeral };

function connectRow(url, s) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel(s.connectButton).setEmoji('🔗'),
  );
}

function resultRow(sessionId, hasMore, s) {
  const row = new ActionRowBuilder();
  if (hasMore) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}more:${sessionId}`).setLabel(s.more).setStyle(ButtonStyle.Secondary).setEmoji('➕'),
    );
  }
  row.addComponents(
    new ButtonBuilder().setCustomId(`${BUTTON_PREFIX}share:${sessionId}`).setLabel(s.share).setStyle(ButtonStyle.Primary).setEmoji('📣'),
  );
  return row;
}

function errorMessage(err, s) {
  if (err instanceof NotConnectedError) return s.reconnect;
  if (err instanceof DailyDevError && err.status === 429) return s.rateLimited;
  if (err?.name === 'TimeoutError') return s.timeout;
  return s.genericError;
}

async function runSearch(tokens, userId, { query, mode, period, limit, cursor }) {
  return tokens.withClient(userId, (client) =>
    mode === 'semantic'
      ? client.semanticSearch(query, { limit, time: period })
      : client.searchPosts(query, { limit, time: period, cursor }),
  );
}

// ---------------------------------------------------------------- handlers

export async function execute(interaction, deps) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'connect') return connect(interaction, deps);
  if (sub === 'disconnect') return disconnect(interaction, deps);
  if (sub === 'status') return status(interaction, deps);
  return search(interaction, deps);
}

async function search(interaction, { tokens, oauth, config }) {
  const s = t(interaction.locale);
  const userId = interaction.user.id;
  // Results are private by default: the API data belongs to the user who searched.
  await interaction.deferReply(ephemeral);

  if (!(await tokens.isConnected(userId))) {
    const { url } = oauth.createAuthorization(userId);
    await interaction.editReply({ content: s.notConnected, components: [connectRow(url, s)] });
    return;
  }

  const query = interaction.options.getString('query', true).trim();
  const period = interaction.options.getString('period') ?? config.defaultPeriod;
  const limit = interaction.options.getInteger('count') ?? config.defaultResults;
  const mode = interaction.options.getString('mode') ?? 'keyword';

  try {
    const { posts, nextCursor } = await runSearch(tokens, userId, { query, mode, period, limit });
    const embed = buildResultsEmbed({ query, posts, period, mode, strings: s });
    const sessionId = saveSession({
      userId, query, mode, period, limit, cursor: nextCursor, offset: posts.length, posts, locale: interaction.locale,
    });
    await interaction.editReply({ embeds: [embed], components: posts.length ? [resultRow(sessionId, Boolean(nextCursor), s)] : [] });
  } catch (err) {
    if (!(err instanceof NotConnectedError) && !(err instanceof DailyDevError)) console.error('[dailydev search]', err);
    const components = err instanceof NotConnectedError ? [connectRow(oauth.createAuthorization(userId).url, s)] : [];
    await interaction.editReply({ content: errorMessage(err, s), embeds: [], components });
  }
}

async function connect(interaction, { tokens, oauth }) {
  const s = t(interaction.locale);
  const record = await tokens.store.get(interaction.user.id);
  if (record) {
    await interaction.reply({ content: s.alreadyConnected(record.username), ...ephemeral });
    return;
  }
  const { url } = oauth.createAuthorization(interaction.user.id);
  await interaction.reply({ content: s.connectPrompt, components: [connectRow(url, s)], ...ephemeral });
}

async function disconnect(interaction, { tokens }) {
  const s = t(interaction.locale);
  await interaction.deferReply(ephemeral);
  const removed = await tokens.disconnect(interaction.user.id);
  for (const key of tagCache.keys()) if (key.startsWith(`${interaction.user.id}:`)) tagCache.delete(key);
  await interaction.editReply(removed ? s.disconnected : s.notLinked);
}

async function status(interaction, { tokens }) {
  const s = t(interaction.locale);
  const record = await tokens.store.get(interaction.user.id);
  const since = record?.connectedAt ? `<t:${Math.floor(Date.parse(record.connectedAt) / 1000)}:D>` : '—';
  await interaction.reply({ content: record ? s.status(record.username, since) : s.notLinked, ...ephemeral });
}

export async function handleButton(interaction, { tokens }) {
  const [, action, sessionId] = interaction.customId.split(':');
  const session = sessions.get(sessionId);
  const s = t(session?.locale ?? interaction.locale);

  if (!session || session.expiresAt < Date.now()) {
    await interaction.reply({ content: action === 'share' ? s.shareExpired : s.sessionExpired, ...ephemeral });
    return;
  }
  if (session.userId !== interaction.user.id) {
    await interaction.reply({ content: s.notYours, ...ephemeral });
    return;
  }

  if (action === 'share') {
    // The user decides to post the links they picked, like pasting them by hand.
    sessions.delete(sessionId);
    await interaction.reply({
      content: buildShareMessage({ userMention: `<@${interaction.user.id}>`, query: session.query, posts: session.posts, strings: s }),
      allowedMentions: { parse: [] },
    });
    return;
  }

  if (action === 'more') {
    await interaction.deferUpdate();
    try {
      const { posts, nextCursor } = await runSearch(tokens, session.userId, session);
      const embed = buildResultsEmbed({ ...session, posts, offset: session.offset, strings: s });
      sessions.delete(sessionId);
      const nextId = saveSession({ ...session, posts, cursor: nextCursor, offset: session.offset + posts.length });
      await interaction.followUp({
        embeds: [embed],
        components: posts.length ? [resultRow(nextId, Boolean(nextCursor), s)] : [],
        ...ephemeral,
      });
    } catch (err) {
      await interaction.followUp({ content: errorMessage(err, s), ...ephemeral });
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Tag suggestions spend the typing user's own quota, so they are:
 * off unless ENABLE_TAG_AUTOCOMPLETE=true, only for connected users, only from N chars,
 * debounced (Discord sends one event per keystroke) and cached per user.
 */
export async function autocomplete(interaction, { tokens, config }) {
  const typed = interaction.options.getFocused().trim().slice(0, 100);
  const choices = typed ? [{ name: typed, value: typed }] : [];
  const respond = (list) => interaction.respond(list.slice(0, 25)).catch(() => {});

  if (!config.tagAutocomplete || typed.length < config.tagAutocompleteMinLength) return respond(choices);

  const userId = interaction.user.id;
  const seq = (autocompleteSeq.get(userId) ?? 0) + 1;
  autocompleteSeq.set(userId, seq);

  const key = `${userId}:${typed.toLowerCase()}`;
  let tags = tagCache.get(key)?.tags;
  if (!tags) {
    await sleep(config.tagAutocompleteDebounceMs);
    if (autocompleteSeq.get(userId) !== seq) return respond(choices); // a newer keystroke arrived
    try {
      tags = await Promise.race([
        tokens.withClient(userId, (client) => client.searchTags(typed)),
        sleep(1800).then(() => { throw new Error('autocomplete budget exceeded'); }),
      ]);
      tagCache.set(key, { tags, expiresAt: Date.now() + TAG_CACHE_TTL_MS });
    } catch {
      return respond(choices); // not connected, quota, timeout: just offer what they typed
    }
  }
  for (const tag of tags) if (tag.toLowerCase() !== typed.toLowerCase()) choices.push({ name: `#${tag}`, value: tag });
  return respond(choices);
}
