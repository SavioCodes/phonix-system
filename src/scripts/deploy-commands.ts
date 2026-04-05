import 'dotenv/config';
import { Client, GatewayIntentBits, REST, Routes, type RESTPostAPIApplicationCommandsJSONBody, type RESTPostAPIChatInputApplicationCommandsJSONBody, type RESTPutAPIApplicationCommandsJSONBody } from 'discord.js';
import { parseConfig } from '../core/config/env.js';
import { getSlashCommandData } from '../modules/commands/registry.js';

type ApplicationCommandBody =
  | RESTPostAPIApplicationCommandsJSONBody
  | RESTPostAPIChatInputApplicationCommandsJSONBody
  | RESTPutAPIApplicationCommandsJSONBody[number];

async function main() {
  const config = parseConfig(process.env);
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  const commands = getSlashCommandData();

  if (config.discordGuildId) {
    const existing = await rest.get(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId));
    logCommandDiff(`guild ${config.discordGuildId}`, existing as ApplicationCommandBody[], commands);
    await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), {
      body: commands,
    });
    const updated = await rest.get(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId));
    logPublishedCommands(`guild ${config.discordGuildId}`, updated as ApplicationCommandBody[]);
    console.log(`Slash commands publicados na guild ${config.discordGuildId}.`);
    return;
  }

  const existing = await rest.get(Routes.applicationCommands(config.discordClientId));
  logCommandDiff('global', existing as ApplicationCommandBody[], commands);
  await rest.put(Routes.applicationCommands(config.discordClientId), {
    body: commands,
  });
  const updated = await rest.get(Routes.applicationCommands(config.discordClientId));
  logPublishedCommands('global', updated as ApplicationCommandBody[]);
  await clearGuildCommandOverrides(config.discordToken, config.discordClientId, rest);
  console.log('Slash commands publicados globalmente.');
}

main().catch((error) => {
  console.error('Falha ao publicar slash commands:', error);
  process.exit(1);
});

function logCommandDiff(scope: string, existing: ApplicationCommandBody[], next: ApplicationCommandBody[]) {
  const existingNames = new Set(existing.map((command) => command.name));
  const nextNames = new Set(next.map((command) => command.name));
  const removed = existing
    .map((command) => command.name)
    .filter((name) => !nextNames.has(name))
    .sort();
  const added = next
    .map((command) => command.name)
    .filter((name) => !existingNames.has(name))
    .sort();

  console.log(`[deploy] Escopo ${scope}: ${existing.length} comandos atuais, ${next.length} comandos desejados.`);
  console.log(`[deploy] Adicionados: ${added.length > 0 ? added.join(', ') : 'nenhum'}.`);
  console.log(`[deploy] Removidos: ${removed.length > 0 ? removed.join(', ') : 'nenhum'}.`);
}

function logPublishedCommands(scope: string, commands: ApplicationCommandBody[]) {
  const names = commands.map((command) => command.name).sort();
  console.log(`[deploy] Escopo ${scope} sincronizado com ${commands.length} comandos: ${names.join(', ')}.`);
}

async function clearGuildCommandOverrides(token: string, applicationId: string, rest: REST) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    await client.login(token);
    const guilds = await client.guilds.fetch();

    for (const guild of guilds.values()) {
      const existing = (await rest.get(Routes.applicationGuildCommands(applicationId, guild.id))) as ApplicationCommandBody[];
      if (existing.length === 0) {
        console.log(`[deploy] Guild ${guild.id} sem comandos locais antigos.`);
        continue;
      }

      const names = existing.map((command) => command.name).sort();
      await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), {
        body: [],
      });
      console.log(`[deploy] Comandos locais removidos da guild ${guild.id}: ${names.join(', ')}.`);
    }
  } finally {
    client.destroy();
  }
}
