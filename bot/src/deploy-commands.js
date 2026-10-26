// Registers the /dailydev slash command with Discord. Run once, and again after changing the command definition.
import { REST, Routes } from 'discord.js';
import { loadConfig } from './config.js';
import { data } from './commands/dailydev.js';

const config = loadConfig({ requireRuntime: false });
const rest = new REST().setToken(config.discordToken);
const body = [data.toJSON()];

const route = config.discordGuildId
  ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
  : Routes.applicationCommands(config.discordClientId);

try {
  await rest.put(route, { body });
  console.log(
    config.discordGuildId
      ? `Registered /dailydev in guild ${config.discordGuildId} (available now).`
      : 'Registered /dailydev globally (may take up to 1 hour to appear).',
  );
} catch (err) {
  console.error('Failed to register commands:', err);
  process.exit(1);
}
