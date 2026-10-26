import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { loadConfig } from './config.js';
import { OAuthClient } from './oauth.js';
import { TokenStore } from './tokenStore.js';
import { TokenManager } from './tokenManager.js';
import { startServer } from './server.js';
import * as dailydevCommand from './commands/dailydev.js';

const config = loadConfig();
const oauth = new OAuthClient({
  clientId: config.oauthClientId,
  clientSecret: config.oauthClientSecret,
  redirectUri: config.redirectUri,
});
const store = new TokenStore({ dataDir: config.dataDir, key: config.encryptionKey });
const tokens = new TokenManager({ store, oauth });
const deps = { tokens, oauth, config };

const server = startServer({ port: config.port, oauth, tokens });

// Slash commands need no privileged intents (no message content access).
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`Logged in as ${c.user.tag}. OAuth redirect: ${config.redirectUri}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isAutocomplete() && interaction.commandName === 'dailydev') {
      await dailydevCommand.autocomplete(interaction, deps);
    } else if (interaction.isChatInputCommand() && interaction.commandName === 'dailydev') {
      await dailydevCommand.execute(interaction, deps);
    } else if (interaction.isButton() && interaction.customId.startsWith(dailydevCommand.BUTTON_PREFIX)) {
      await dailydevCommand.handleButton(interaction, deps);
    }
  } catch (err) {
    console.error('Unhandled interaction error', err);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close();
    client.destroy();
    process.exit(0);
  });
}

client.login(config.discordToken);
