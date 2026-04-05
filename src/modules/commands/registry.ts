import { MessageFlags, type ChatInputCommandInteraction, type Message } from 'discord.js';
import { configCommands } from './configCommands.js';
import { doctorCommands } from './doctorCommands.js';
import { executeCommand } from './execution.js';
import { CommandContext, type CommandDefinition, type CommandServices } from './framework.js';
import { libraryCommands } from './libraryCommands.js';
import { playbackCommands } from './playbackCommands.js';
import { extractCommandBody, tokenizeCommandInput } from './prefix.js';
import { utilityCommands } from './utilityCommands.js';
import { ownerCommands } from './ownerCommands.js';

export const commandDefinitions = [...playbackCommands, ...libraryCommands, ...configCommands, ...doctorCommands, ...utilityCommands, ...ownerCommands] satisfies readonly CommandDefinition<unknown>[];

const commandMap = new Map<string, CommandDefinition<unknown>>();

for (const command of commandDefinitions) {
  registerCommandKey(command.name, command);
  for (const alias of command.aliases ?? []) {
    registerCommandKey(alias, command);
  }
}

export function getSlashCommandData() {
  return commandDefinitions.map((command) => command.data.toJSON());
}

export async function handleSlashInteraction(interaction: ChatInputCommandInteraction, services: CommandServices) {
  const command = commandMap.get(interaction.commandName);
  if (!command) {
    return;
  }

  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: 'O PHONIX so funciona dentro de servidores.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const context = new CommandContext({
    client: interaction.client,
    services,
    guild: interaction.guild,
    member,
    user: interaction.user,
    channelId: interaction.channelId,
    source: 'slash',
    interaction,
  });

  await executeCommand(command, context, () => command.parseSlash(interaction));
}

export async function handlePrefixMessage(message: Message, services: CommandServices) {
  if (!message.inGuild() || !message.guild || message.author.bot) {
    return;
  }

  const prefix = await services.guildSettings.getPrefix(message.guild.id);
  const body = extractCommandBody(message.content, prefix, message.client.user.id);
  if (!body) {
    return;
  }

  const tokens = tokenizeCommandInput(body);
  const commandName = tokens.shift()?.toLowerCase();
  if (!commandName) {
    return;
  }

  const command = commandMap.get(commandName);
  if (!command) {
    return;
  }

  const member = message.member ?? (await message.guild.members.fetch(message.author.id));
  const context = new CommandContext({
    client: message.client,
    services,
    guild: message.guild,
    member,
    user: message.author,
    channelId: message.channel.id,
    source: 'prefix',
    message,
  });

  await executeCommand(command, context, () => command.parsePrefix(tokens));
}

function registerCommandKey(key: string, command: CommandDefinition<unknown>) {
  const existing = commandMap.get(key);
  if (existing && existing !== command) {
    throw new Error(`Chave de comando duplicada detectada: ${key}`);
  }

  commandMap.set(key, command);
}
