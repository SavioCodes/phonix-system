import { Client, GatewayIntentBits, Partials, type ClientOptions } from 'discord.js';

export function createDiscordClient() {
  const options: ClientOptions = {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
  };

  return new Client(options);
}

