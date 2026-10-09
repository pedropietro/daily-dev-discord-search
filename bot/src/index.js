import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { loadConfig } from './config.js';
import { DailyDevClient } from './dailydev.js';
import * as dailydevCommand from './commands/dailydev.js';

const config = loadConfig();
const dailyDev = new DailyDevClient(config.dailyDevToken);
const deps = { dailyDev, config };

// Slash commands need no privileged intents (no message content access).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}. /dailydev busca is ready.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === 'dailydev') {
      await dailydevCommand.autocomplete(interaction, deps);
      return;
    }
    if (interaction.isChatInputCommand() && interaction.commandName === 'dailydev') {
      if (interaction.options.getSubcommand() === 'busca') {
        await dailydevCommand.execute(interaction, deps);
      }
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith(dailydevCommand.MORE_BUTTON_PREFIX)) {
      await dailydevCommand.handleMoreButton(interaction, deps);
    }
  } catch (err) {
    console.error('Unhandled interaction error', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction
        .reply({ content: '⚠️ Algo deu errado.', flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    client.destroy();
    process.exit(0);
  });
}

client.login(config.discordToken);
