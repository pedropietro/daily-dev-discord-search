import 'dotenv/config';

const PERIODS = ['day', 'week', 'month', 'year', 'all'];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing environment variable ${name}. See .env.example.`);
  }
  return value;
}

function clampInt(raw, fallback, min, max) {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function loadConfig({ requireDiscord = true } = {}) {
  const defaultPeriod = process.env.DEFAULT_PERIOD?.trim();
  return {
    discordToken: requireDiscord ? required('DISCORD_TOKEN') : process.env.DISCORD_TOKEN,
    discordClientId: requireDiscord ? required('DISCORD_CLIENT_ID') : process.env.DISCORD_CLIENT_ID,
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || null,
    dailyDevToken: required('DAILY_DEV_TOKEN'),
    defaultResults: clampInt(process.env.DEFAULT_RESULTS, 5, 1, 10),
    defaultPeriod: PERIODS.includes(defaultPeriod) ? defaultPeriod : 'month',
  };
}

export { PERIODS };
