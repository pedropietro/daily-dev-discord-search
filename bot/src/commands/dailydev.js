import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { DailyDevError } from '../dailydev.js';
import { buildResultsEmbed, PERIOD_LABELS } from '../format.js';

export const MORE_BUTTON_PREFIX = 'ddmore:';
const SESSION_TTL_MS = 15 * 60 * 1000;
const TAG_CACHE_TTL_MS = 10 * 60 * 1000;

export const data = new SlashCommandBuilder()
  .setName('dailydev')
  .setDescription('Busca posts no daily.dev')
  .addSubcommand((sub) =>
    sub
      .setName('busca')
      .setDescription('Sugere os melhores posts do daily.dev sobre um tema')
      .addStringOption((o) =>
        o
          .setName('tema')
          .setDescription('Tema ou pergunta (ex.: kafka, "virtual threads em produção")')
          .setRequired(true)
          .setMaxLength(200)
          .setAutocomplete(true),
      )
      .addStringOption((o) =>
        o
          .setName('periodo')
          .setDescription('Janela de tempo')
          .addChoices(...Object.entries(PERIOD_LABELS).map(([value, name]) => ({ name, value }))),
      )
      .addIntegerOption((o) =>
        o.setName('quantidade').setDescription('Quantos posts mostrar (1-10)').setMinValue(1).setMaxValue(10),
      )
      .addStringOption((o) =>
        o
          .setName('modo')
          .setDescription('Tipo de busca')
          .addChoices(
            { name: 'Palavra-chave (padrão)', value: 'keyword' },
            { name: 'Semântica (perguntas em linguagem natural)', value: 'semantic' },
          ),
      )
      .addBooleanOption((o) => o.setName('privado').setDescription('Mostrar o resultado só para você')),
  );

/** In-memory state for the "Mais resultados" button. Fine for a single process. */
const sessions = new Map();
const tagCache = new Map();

function saveSession(session) {
  const id = randomUUID().slice(0, 12);
  sessions.set(id, { ...session, expiresAt: Date.now() + SESSION_TTL_MS });
  return id;
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of sessions) if (v.expiresAt < now) sessions.delete(k);
  for (const [k, v] of tagCache) if (v.expiresAt < now) tagCache.delete(k);
}
setInterval(pruneExpired, 60 * 1000).unref();

function moreButtonRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(MORE_BUTTON_PREFIX + sessionId)
      .setLabel('Mais resultados')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('➕'),
  );
}

async function runSearch(client, { query, mode, period, limit, cursor }) {
  return mode === 'semantic'
    ? client.semanticSearch(query, { limit, time: period })
    : client.searchPosts(query, { limit, time: period, cursor });
}

function friendlyError(err) {
  if (err instanceof DailyDevError) return `⚠️ ${err.message}`;
  if (err?.name === 'TimeoutError') return '⚠️ O daily.dev demorou para responder. Tente novamente.';
  return '⚠️ Não consegui buscar no daily.dev agora. Tente novamente em instantes.';
}

export async function execute(interaction, { dailyDev, config }) {
  const query = interaction.options.getString('tema', true).trim();
  const period = interaction.options.getString('periodo') ?? config.defaultPeriod;
  const limit = interaction.options.getInteger('quantidade') ?? config.defaultResults;
  const mode = interaction.options.getString('modo') ?? 'keyword';
  const ephemeral = interaction.options.getBoolean('privado') ?? false;

  await interaction.deferReply(ephemeral ? { flags: MessageFlags.Ephemeral } : {});

  try {
    const { posts, nextCursor } = await runSearch(dailyDev, { query, mode, period, limit });
    const embed = buildResultsEmbed({ query, posts, period, mode });
    const components = nextCursor
      ? [moreButtonRow(saveSession({ query, mode, period, limit, cursor: nextCursor, offset: posts.length, ephemeral }))]
      : [];
    await interaction.editReply({ embeds: [embed], components });
  } catch (err) {
    console.error('[dailydev busca]', err);
    await interaction.editReply({ content: friendlyError(err), embeds: [], components: [] });
  }
}

export async function handleMoreButton(interaction, { dailyDev }) {
  const sessionId = interaction.customId.slice(MORE_BUTTON_PREFIX.length);
  const session = sessions.get(sessionId);

  if (!session || session.expiresAt < Date.now()) {
    await interaction.reply({
      content: 'Essa busca expirou. Rode `/dailydev busca` de novo.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Remove the button from the previous page so it can't be clicked twice.
  await interaction.update({ components: [] });

  try {
    const { posts, nextCursor } = await runSearch(dailyDev, session);
    const embed = buildResultsEmbed({ ...session, posts, offset: session.offset });
    sessions.delete(sessionId);
    const components = nextCursor
      ? [moreButtonRow(saveSession({ ...session, cursor: nextCursor, offset: session.offset + posts.length }))]
      : [];
    await interaction.followUp({
      embeds: [embed],
      components,
      ...(session.ephemeral ? { flags: MessageFlags.Ephemeral } : {}),
    });
  } catch (err) {
    console.error('[dailydev mais]', err);
    await interaction.followUp({ content: friendlyError(err), flags: MessageFlags.Ephemeral });
  }
}

export async function autocomplete(interaction, { dailyDev }) {
  const typed = interaction.options.getFocused().trim();
  const choices = typed ? [{ name: typed.slice(0, 100), value: typed.slice(0, 100) }] : [];

  if (typed.length >= 2) {
    const key = typed.toLowerCase();
    let tags = tagCache.get(key)?.tags;
    if (!tags) {
      try {
        tags = await dailyDev.searchTags(typed);
        tagCache.set(key, { tags, expiresAt: Date.now() + TAG_CACHE_TTL_MS });
      } catch {
        tags = []; // autocomplete must answer within 3s; never fail loudly here
      }
    }
    for (const tag of tags) {
      if (tag.toLowerCase() !== key) choices.push({ name: `#${tag}`, value: tag });
    }
  }

  await interaction.respond(choices.slice(0, 25)).catch(() => {});
}
